export default ({
  func,
  color,
  text
}: {
  func: () => void
  color: string
  text: string
}) => (
  <button
    onClick={func}
    class={`mt-4 dark:bg-${color}-400 hover:dark:bg-${color}-500 dark:text-gray-800 font-bold mx-2 px-2 py-1 rounded`}
  >
    {text}
  </button>
)
