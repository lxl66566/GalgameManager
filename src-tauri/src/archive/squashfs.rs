#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
use std::{
    env::set_current_dir,
    fs::File,
    io,
    path::Path,
    time::{Duration, SystemTime},
};

use backhand::{
    compression::{CompressionOptions, Compressor, Zstd},
    kind::{self, Kind},
    BackhandError, FilesystemCompressor, FilesystemWriter, NodeHeader, DEFAULT_BLOCK_SIZE,
};

trait MyPushExt {
    fn my_push_dir(&mut self, path: impl AsRef<Path>, header: NodeHeader) -> io::Result<()>;
}

impl MyPushExt for FilesystemWriter<'_, '_, '_> {
    fn my_push_dir(&mut self, path: impl AsRef<Path>, header: NodeHeader) -> io::Result<()> {
        let path = path.as_ref();
        let cur = std::env::current_dir()?;
        let parent = path.parent().ok_or(BackhandError::InvalidFilePath)?;
        let filename = path.file_name().ok_or(BackhandError::InvalidFilePath)?;
        set_current_dir(parent)?;
        self.push_dir(filename, header)?;
        set_current_dir(cur)?;
        Ok(())
    }
}

pub(crate) struct SquashfsArchiver(pub(crate) u8);

impl SquashfsArchiver {
    /// 辅助函数：根据文件路径生成 NodeHeader
    fn create_header(path: impl AsRef<Path>) -> io::Result<NodeHeader> {
        let path = path.as_ref();
        let metadata = path.metadata()?;

        // 获取 mtime (Unix 时间戳)
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as u32)
            .unwrap_or(0);

        #[cfg(unix)]
        {
            // Linux/Unix: 使用实际的文件元数据
            Ok(NodeHeader {
                permissions: (metadata.mode() & 0o777) as u16,
                uid: metadata.uid(),
                gid: metadata.gid(),
                mtime,
            })
        }

        #[cfg(not(unix))]
        {
            // Windows 或其他非 Unix 平台: 补充 mtime，uid/gid 使用默认值
            Ok(NodeHeader {
                permissions: if metadata.is_dir() { 0o755 } else { 0o644 },
                uid: 1000,
                gid: 1000,
                mtime,
            })
        }
    }
}

impl super::Archive for SquashfsArchiver {
    fn archive(
        &self,
        paths: Vec<impl AsRef<Path>>,
        writer: impl io::Write + io::Seek,
    ) -> io::Result<()> {
        // 创建 FilesystemWriter
        let mut fs = FilesystemWriter::default();
        fs.set_current_time();
        fs.set_block_size(DEFAULT_BLOCK_SIZE);
        fs.set_only_root_id();
        fs.set_kind(Kind::from_const(kind::LE_V4_0).unwrap());

        // 配置 zstd 压缩
        let zstd_options = Zstd {
            compression_level: self.0 as u32,
        };
        let compression_options = CompressionOptions::Zstd(zstd_options);
        let compressor = FilesystemCompressor::new(Compressor::Zstd, Some(compression_options))?;
        fs.set_compressor(compressor);

        // 添加文件和目录
        for path in paths {
            let header = Self::create_header(&path)?;

            if path.as_ref().is_dir() {
                fs.my_push_dir(&path, header)?;
            } else {
                let file = File::open(&path)?;
                let filename = path.as_ref().file_name().ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidFilename, "Invalid filename")
                })?;
                fs.push_file(file, filename, header)?;
            }
        }

        // 写入 squashfs 镜像
        let mut output = io::BufWriter::new(writer);
        fs.write(&mut output)?;

        Ok(())
    }

    fn extract(
        &self,
        reader: impl io::Read + io::Seek + Send,
        targets: Vec<impl AsRef<Path>>,
    ) -> io::Result<()> {
        use std::{
            collections::HashMap,
            ffi::OsStr,
            io::BufReader,
            path::{Component, PathBuf},
        };

        use backhand::{FilesystemReader, InnerNode};

        // 1. 准备读取器
        let mut buf_reader = BufReader::new(reader);
        let fs = FilesystemReader::from_reader(&mut buf_reader)?;

        // 2. 构建目标映射表: (期望的文件名 -> 完整的解压目标路径)
        // 假设 targets 里的文件名与 archive 里的顶层文件名是一一对应的
        let mut target_map: HashMap<&OsStr, PathBuf> = HashMap::new();
        for target in &targets {
            let target_path = target.as_ref();
            if let Some(name) = target_path.file_name() {
                target_map.insert(name, target_path.to_path_buf());
            }
        }

        // 3. 遍历镜像中的所有节点
        // fs.files() 返回镜像中所有节点的迭代器
        for node in fs.files() {
            let path_in_image = &node.fullpath;

            // 解析路径组件
            let mut components = path_in_image.components();

            // Squashfs 路径总是以 "/" 开头，跳过 RootDir
            if let Some(Component::RootDir) = components.next() {
                // 获取第一层名称 (例如 "/app/bin/tool" -> "app")
                if let Some(Component::Normal(root_entry_name)) = components.next() {
                    // 检查这个顶层名称是否在我们的解压目标列表中
                    if let Some(target_base_path) = target_map.get(root_entry_name) {
                        // 计算该节点在物理磁盘上的最终路径
                        // 逻辑：TargetBase + (PathInImage - /RootEntryName)
                        // 例：Image: "/app/config/settings.json", Target: "/opt/myapp"
                        // 相对路径: "config/settings.json"
                        // 最终路径: "/opt/myapp/config/settings.json"

                        let root_prefix = Path::new("/").join(root_entry_name);

                        // 获取相对于顶层入口的路径
                        let relative_path = path_in_image
                            .strip_prefix(&root_prefix)
                            .unwrap_or_else(|_| Path::new("")); // 如果是顶层目录本身，strip后为空

                        let dest_path = target_base_path.join(relative_path);

                        let mtime =
                            SystemTime::UNIX_EPOCH + Duration::from_secs(node.header.mtime as u64);

                        // 根据节点类型执行解压
                        match &node.inner {
                            InnerNode::File(file_info) => {
                                // 确保父目录存在
                                if let Some(parent) = dest_path.parent() {
                                    if !parent.as_os_str().is_empty() {
                                        std::fs::create_dir_all(parent)?;
                                    }
                                }

                                let file_reader = fs.file(file_info);
                                let mut dest_file = File::create(&dest_path)?;
                                io::copy(&mut file_reader.reader(), &mut dest_file)?;

                                // 恢复权限 (Unix)
                                #[cfg(unix)]
                                {
                                    use std::os::unix::fs::PermissionsExt;
                                    let perms = std::fs::Permissions::from_mode(
                                        node.header.permissions as u32,
                                    );
                                    std::fs::set_permissions(&dest_path, perms)?;
                                }

                                let _ = dest_file.set_modified(mtime);
                            }
                            InnerNode::Dir(_) => {
                                // 创建目录
                                std::fs::create_dir_all(&dest_path)?;

                                #[cfg(unix)]
                                {
                                    use std::os::unix::fs::PermissionsExt;
                                    let perms = std::fs::Permissions::from_mode(
                                        node.header.permissions as u32,
                                    );
                                    std::fs::set_permissions(&dest_path, perms)?;
                                }

                                // 目录通常不强制恢复 mtime，
                                // 因为后续写入子文件会修改它，
                                // 如果需要严格恢复，需在所有子文件处理完后再次设置。
                            }
                            InnerNode::Symlink(_link) => {
                                if let Some(parent) = dest_path.parent() {
                                    std::fs::create_dir_all(parent)?;
                                }

                                #[cfg(unix)]
                                {
                                    // 删除已存在的同名文件/链接，防止 symlink 失败
                                    if dest_path.is_symlink() || dest_path.exists() {
                                        let _ = std::fs::remove_file(&dest_path);
                                    }
                                    std::os::unix::fs::symlink(&link.link, &dest_path)?;
                                }
                            }
                            _ => {} // 忽略字符设备等
                        }
                    }
                }
            }
        }

        Ok(())
    }
}
