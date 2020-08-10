import { useContext, useRef, useState, useEffect, useCallback } from 'react'

import defaultConfig, { cache } from './config'
import SWRConfigContext from './swr-config-context'
import useSWR from './use-swr'

import {
  keyType,
  fetcherFn,
  ConfigInterface,
  responseInterface,
  PageInfo,
  PageDirection
} from './types'

type DataRecord<Data = any> = Record<number, Data>

type KeyLoader<Data = any> = (
  index: number,
  previousPageInfo: PageInfo<Data> | null
) => keyType
type SWRTwoWayConfigInterface<Data = any, Error = any> = ConfigInterface<
  DataRecord<Data>,
  Error,
  fetcherFn<DataRecord<Data>>
> & {
  initialSize?: number
  revalidateAll?: boolean
  persistSize?: boolean
}
type SWRTwoWayResponseInterface<Data = any, Error = any> = responseInterface<
  DataRecord<Data>,
  Error
> & {
  size: number
  fetch: (fetchNext: boolean) => Promise<DataRecord<Data> | undefined>
} /*& {
  size: number
  setSize: (
    size: number | ((size: number) => number)
  ) => Promise<Data[] | undefined>
}*/

function useSWRTwoWayInfinite<Data = any, Error = any>(
  getKey: KeyLoader<Data>
): SWRTwoWayResponseInterface<Data, Error>
function useSWRTwoWayInfinite<Data = any, Error = any>(
  getKey: KeyLoader<Data>,
  config?: SWRTwoWayConfigInterface<Data, Error>
): SWRTwoWayResponseInterface<Data, Error>
function useSWRTwoWayInfinite<Data = any, Error = any>(
  getKey: KeyLoader<Data>,
  fn?: fetcherFn<Data>,
  config?: SWRTwoWayConfigInterface<Data, Error>
): SWRTwoWayResponseInterface<Data, Error>
function useSWRTwoWayInfinite<Data = any, Error = any>(
  ...args
): SWRTwoWayResponseInterface<Data, Error> {
  let getKey: KeyLoader<Data>,
    fn: fetcherFn<Data> | undefined,
    config: SWRTwoWayConfigInterface<Data, Error> = {}

  if (args.length >= 1) {
    getKey = args[0]
  }
  if (args.length > 2) {
    fn = args[1]
    config = args[2]
  } else {
    if (typeof args[1] === 'function') {
      fn = args[1]
    } else if (typeof args[1] === 'object') {
      config = args[1]
    }
  }

  config = Object.assign(
    {},
    defaultConfig,
    useContext(SWRConfigContext),
    config
  )
  let {
    initialSize = 1,
    revalidateAll = false,
    persistSize = false,
    fetcher: defaultFetcher,
    ...extraConfig
  } = config

  if (typeof fn === 'undefined') {
    // use the global fetcher
    // we have to convert the type here
    fn = (defaultFetcher as unknown) as fetcherFn<Data>
  }

  // get the serialized key of the first page
  let firstPageKey: string | null = null
  try {
    ;[firstPageKey] = cache.serializeKey(getKey(0, null))
  } catch (err) {
    // not ready
  }

  const rerender = useState<boolean>(false)[1]

  // we use cache to pass extra info (context) to fetcher so it can be globally shared
  // here we get the key of the fetcher context cache
  let contextCacheKey: string | null = null
  if (firstPageKey) {
    contextCacheKey = 'context@' + firstPageKey
  }

  // page count is cached as well, so when navigating the list can be restored
  // let pageCountCacheKey: string | null = null
  let pageMinCacheKey: string | null = null
  let pageMaxCacheKey: string | null = null
  // let cachedPageSize
  let cachedPageMin: number
  let cachedPageMax: number
  if (firstPageKey) {
    pageMinCacheKey = 'pageMin@' + firstPageKey
    pageMaxCacheKey = 'pageMax@' + firstPageKey
    // cachedPageSize = cache.get(pageCountCacheKey)
    cachedPageMin = cache.get(pageMinCacheKey)
    cachedPageMax = cache.get(pageMaxCacheKey)
  }
  // const pageCountRef = useRef<number>(cachedPageSize || initialSize)
  const pageMinRef = useRef<number>(cachedPageMin || 0)
  const pageMaxRef = useRef<number>(cachedPageMax || initialSize - 1)
  const didMountRef = useRef<boolean>(false)

  // every time the key changes, we reset the page size if it's not persisted
  useEffect(() => {
    if (didMountRef.current) {
      if (!persistSize) {
        // pageCountRef.current = initialSize
        pageMinRef.current = 0
        pageMaxRef.current = initialSize - 1
      }
    } else {
      didMountRef.current = true
    }
  }, [firstPageKey])

  // actual swr of all pages
  const swr = useSWR<DataRecord<Data>, Error>(
    firstPageKey ? ['many', firstPageKey] : null,
    async () => {
      // get the revalidate context
      const { originalData, force } = cache.get(contextCacheKey) || {}

      // return an array of page data
      const data: DataRecord<Data> = []

      // must revalidate if:
      // - forced to revalidate all
      // - we revalidate the first page by default (e.g.: upon focus)
      // - page has changed
      // - the offset has changed so the cache is missing
      const toShouldRevalidatePage = (index: number, pageData: any) =>
        revalidateAll ||
        force ||
        (typeof force === 'undefined' && index === 0) ||
        (originalData && !config.compare(originalData[index], pageData)) ||
        typeof pageData === 'undefined'

      let previousPageData = null
      for (let i = 0; i >= pageMinRef.current; --i) {
        const [pageKey, pageArgs] = cache.serializeKey(
          getKey(i, { data: previousPageData, pageToGet: PageDirection.Prev })
        )

        if (!pageKey) {
          // pageKey is falsy, stop fetching next pages
          break
        }

        // get the current page cache
        let pageData = cache.get(pageKey)

        if (toShouldRevalidatePage(i, pageData)) {
          if (pageArgs !== null) {
            pageData = await fn(...pageArgs)
          } else {
            pageData = await fn(pageKey)
          }
          cache.set(pageKey, pageData)
        }

        data[i] = pageData
        previousPageData = pageData
      }
      for (let i = 0; i <= pageMinRef.current; ++i) {
        const [pageKey, pageArgs] = cache.serializeKey(
          getKey(i, { data: previousPageData, pageToGet: PageDirection.Next })
        )

        if (!pageKey) {
          // pageKey is falsy, stop fetching next pages
          break
        }

        // get the current page cache
        let pageData = cache.get(pageKey)

        if (toShouldRevalidatePage(i, pageData)) {
          if (pageArgs !== null) {
            pageData = await fn(...pageArgs)
          } else {
            pageData = await fn(pageKey)
          }
          cache.set(pageKey, pageData)
        }

        data[i] = pageData
        previousPageData = pageData
      }

      // once we executed the data fetching based on the context, clear the context
      cache.delete(contextCacheKey)

      // return the data
      return data
    },
    extraConfig
  )

  const swrTwoWay = swr as SWRTwoWayResponseInterface<Data, Error>

  // extend the SWR API
  const mutate = swrTwoWay.mutate
  swrTwoWay.size = pageMaxRef.current - pageMinRef.current + 1
  swrTwoWay.mutate = useCallback(
    (data, shouldRevalidate = true) => {
      if (shouldRevalidate && typeof data !== 'undefined') {
        // we only revalidate the pages that are changed
        const originalData = swrTwoWay.data
        cache.set(contextCacheKey, { originalData, force: false })
      } else if (shouldRevalidate) {
        // calling `mutate()`, we revalidate all pages
        cache.set(contextCacheKey, { force: true })
      }

      return mutate(data, shouldRevalidate)
    },
    [mutate, swrTwoWay.data, contextCacheKey]
  )
  //   swrInfinite.setSize = useCallback(
  //     arg => {
  //       if (typeof arg === 'function') {
  //         pageCountRef.current = arg(pageCountRef.current)
  //       } else if (typeof arg === 'number') {
  //         pageCountRef.current = arg
  //       }
  //       cache.set(pageCountCacheKey, pageCountRef.current)
  //       rerender(v => !v)
  //       return swrInfinite.mutate(v => v)
  //     },
  //     [swrInfinite.mutate, pageCountCacheKey]
  //   )
  swrTwoWay.fetch = useCallback(
    (fetchNext: boolean) => {
      if (fetchNext) {
        pageMaxRef.current++
      } else {
        pageMinRef.current--
      }
      // pageCountRef.current++
      // cache.set(pageCountCacheKey, pageCountRef.current)
      cache.set(pageMinCacheKey, pageMinRef.current)
      cache.set(pageMaxCacheKey, pageMaxRef.current)
      rerender(v => !v)
      return swrTwoWay.mutate(v => v)
    },
    [swrTwoWay.mutate, pageMinCacheKey, pageMaxCacheKey]
  )

  return swrTwoWay
}

export {
  useSWRTwoWayInfinite,
  SWRTwoWayConfigInterface,
  SWRTwoWayResponseInterface
}
