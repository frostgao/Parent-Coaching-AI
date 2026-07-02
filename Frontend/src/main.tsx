import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
// 👇 注意这里的变化：引入的是 getRouter 函数
import { getRouter } from './router' 

// 调用函数，生成当前运行时的 router 实例
const router = getRouter()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)