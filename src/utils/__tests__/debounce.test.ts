import { debounce } from '@utils/debounce'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call fn immediately', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 100)
    debounced()
    expect(function_).not.toHaveBeenCalled()
  })

  it('calls fn once after the delay', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 100)
    debounced()
    vi.advanceTimersByTime(100)
    expect(function_).toHaveBeenCalledTimes(1)
  })

  it('coalesces multiple rapid calls into a single trailing call', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 100)
    debounced()
    debounced()
    debounced()
    vi.advanceTimersByTime(100)
    expect(function_).toHaveBeenCalledTimes(1)
  })

  it('passes the args of the most recent call', () => {
    const function_ = vi.fn<(...args: string[]) => void>()
    const debounced = debounce(function_, 100)
    debounced('a')
    debounced('b')
    debounced('c')
    vi.advanceTimersByTime(100)
    expect(function_).toHaveBeenCalledWith('c')
  })

  it('resets the timer when called again within the window', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 100)
    debounced()
    vi.advanceTimersByTime(90)
    expect(function_).not.toHaveBeenCalled()
    debounced() // restart timer
    vi.advanceTimersByTime(90)
    expect(function_).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10)
    expect(function_).toHaveBeenCalledTimes(1)
  })

  it('cancel() prevents the pending invocation', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 100)
    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(1000)
    expect(function_).not.toHaveBeenCalled()
  })

  it('cancel() is a no-op when there is nothing pending', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 100)
    expect(() => {
      debounced.cancel()
    }).not.toThrow()
    vi.advanceTimersByTime(1000)
    expect(function_).not.toHaveBeenCalled()
  })

  it('can be called again after a previous invocation fires', () => {
    const function_ = vi.fn<() => void>()
    const debounced = debounce(function_, 50)
    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)
    expect(function_).toHaveBeenCalledTimes(2)
  })
})
