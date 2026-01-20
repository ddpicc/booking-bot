import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.css'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    Taro.cloud.init({
      env: 'cloud1-8go2n6w41a48657b',
      traceUser: true,
    })
    console.log('App launched.')
  })

  // children 是将要会渲染的页面
  return children
}



export default App
