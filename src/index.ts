export * from './use-swr'
import { default as useSWR } from './use-swr'
export {
  useSWRInfinite,
  SWRInfiniteConfigInterface,
  SWRInfiniteResponseInterface
} from './use-swr-infinite'
export {
  useSWRTwoWayInfinite,
  SWRTwoWayConfigInterface,
  SWRTwoWayResponseInterface
} from './use-swr-two-way-infinite'
export { cache } from './config'
export {
  ConfigInterface,
  revalidateType,
  RevalidateOptionInterface,
  keyInterface,
  responseInterface,
  CacheInterface,
  PageDirection,
  PageInfo
} from './types'
export default useSWR
