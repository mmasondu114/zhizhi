import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { App } from './App';
import './lesson.css';
import '@xyflow/react/dist/style.css';
import 'katex/dist/katex.min.css';
import './style.css';
import './appearance.css';

createRoot(document.getElementById('root')).render(
  <ReactFlowProvider>
    <App />
  </ReactFlowProvider>,
);
