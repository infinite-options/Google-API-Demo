import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AppSecure from './AppSecure';
import reportWebVitals from './reportWebVitals';

// Check for secure mode parameter from environment variable
const USE_SECURE_APP = process.env.REACT_APP_SECURE_MODE === 'true';

console.log('🔧 App Mode:', USE_SECURE_APP ? 'SECURE (AppSecure.js)' : 'STANDARD (App.js)');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {USE_SECURE_APP ? <AppSecure /> : <App />}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
