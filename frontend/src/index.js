import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import 'antd/dist/reset.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ConfigProvider locale={koKR} theme={{
    token: {
      colorPrimary: '#1677ff',
    },
  }}>
    <App />
  </ConfigProvider>
);