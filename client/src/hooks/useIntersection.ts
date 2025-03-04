import { useEffect, useRef, useState } from 'react'

interface UseIntersectionOptions {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
}

export function useIntersection({
  threshold = 0,
  rootMargin = '0px',
  triggerOnce = false
}: UseIntersectionOptions = {}) {
  const [isIntersecting, setIntersecting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIntersecting(entry.isIntersecting)
        if (triggerOnce && entry.isIntersecting && ref.current) {
          observer.unobserve(ref.current)
        }
      },
      { threshold, rootMargin }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [rootMargin, threshold, triggerOnce])

  return { ref, isIntersecting }
}