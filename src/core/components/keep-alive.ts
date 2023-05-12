import { isRegExp, isArray, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'
import type VNode from 'core/vdom/vnode'
import type { VNodeComponentOptions } from 'types/vnode'
import type { Component } from 'types/component'
import { getComponentName } from '../vdom/create-component'

type CacheEntry = {
  name?: string
  tag?: string
  componentInstance?: Component
}

type CacheEntryMap = Record<string, CacheEntry | null>

function _getComponentName(opts?: VNodeComponentOptions): string | null {
  return opts && (getComponentName(opts.Ctor.options as any) || opts.tag)
}

function matches(
  pattern: string | RegExp | Array<string>,
  name: string
): boolean {
  if (isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function pruneCache(
  keepAliveInstance: { cache: CacheEntryMap; keys: string[]; _vnode: VNode },
  filter: Function
) {
  const { cache, keys, _vnode } = keepAliveInstance
  for (const key in cache) {
    const entry = cache[key]
    if (entry) {
      const name = entry.name
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

function pruneCacheEntry(
  cache: CacheEntryMap,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  const entry = cache[key]
  if (entry && (!current || entry.tag !== current.tag)) {
    // @ts-expect-error can be undefined
    entry.componentInstance.$destroy()
  }
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

// TODO defineComponent
export default {
  name: 'keep-alive',
  abstract: true,

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  methods: {
    // 缓存虚拟dom
    cacheVNode() {
      const { cache, keys, vnodeToCache, keyToCache } = this
      if (vnodeToCache) {
        const { tag, componentInstance, componentOptions } = vnodeToCache
        cache[keyToCache] = {
          name: _getComponentName(componentOptions),
          tag,
          componentInstance
        }
        // 添加到缓存数组
        keys.push(keyToCache)
        // prune oldest entry

        // 如果缓存数大于了max，就把已缓存组件中最久没有被访问的实例删掉
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
        this.vnodeToCache = null
      }
    }
  },

  created() {
    this.cache = Object.create(null)
    this.keys = []
  },

  destroyed() {
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted() {
    this.cacheVNode()
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  updated() {
    this.cacheVNode()
  },

  render() {
    // 获取默认插槽数组
    const slot = this.$slots.default
    // 获取默认插槽数组中第一个虚拟dom
    const vnode = getFirstComponentChild(slot)
    // 获取组件选项
    const componentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern

      // 获取组件name，没有name就返回组件的tag
      const name = _getComponentName(componentOptions)
      const { include, exclude } = this
      if (
        // not included

        // 如果获取到的组件name不在缓存数组中
        (include && (!name || !matches(include, name))) ||
        // excluded

        // 或者组件name在排除数组中
        (exclude && name && matches(exclude, name))
      ) {
        // 则直接返回虚拟dom
        return vnode
      }

      const { cache, keys } = this
      // 获取组件的key
      const key =
        vnode.key == null
          ? // same constructor may get registered as different local components
            // so cid alone is not enough (#3269)

            // 上面这一段英文是说，只有cid是不够的，因为同一个构造函数可能会被注册为多个组件
            // 如果key为空，就去获取组件的cid
            // 然后将获取到的cid和虚拟dom的tag拼接起来作为key，`${componentOptions.Ctor.cid::${componentOptions.tag}}`
            componentOptions.Ctor.cid +
            (componentOptions.tag ? `::${componentOptions.tag}` : '')
          : vnode.key
      if (cache[key]) {
        // 如果在缓存中找到了,直接从缓存中拿到虚拟dom的实例
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest

        // 这里是把组件的key先移除掉,然后在push进去,这样这个组件就是最新活动的组件了
        remove(keys, key)
        keys.push(key)
      } else {
        // delay setting the cache until update

        // 这里是暂时将需要缓存的虚拟dom和key临时保存到this中
        // 在mounted里面执行cacheVNode方法的时候才将key push到keys数组中
        // push进去之后才将虚拟dom赋值为空
        // 这样做的目的是为了保证在首次渲染完成之前，keep-alive组件的keys数组中不会包含未完成渲染的组件。
        // 只有在组件初始化和首次渲染完成之后，才将其对应的key push到keys数组中，表示该组件已经准备好进行缓存。
        // 这种设计可以避免在组件渲染过程中将未完成的组件添加到缓存中，确保缓存的组件都是已经初始化和渲染完成的可靠组件。
        this.vnodeToCache = vnode
        this.keyToCache = key
      }
      // @ts-expect-error can vnode.data can be undefined
      
      // 将虚拟dom的data中keepAlive设置为true,表示应该被缓存
      vnode.data.keepAlive = true
    }
    // 最后返回虚拟dom
    return vnode || (slot && slot[0])
  }
}
