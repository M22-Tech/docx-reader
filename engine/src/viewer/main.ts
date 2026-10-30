import '../model/layout.css';
import '../model/reading.css';
import './viewer.css';
import { listenToApp, sendToApp } from './transport';
import { createViewer } from './viewer';

const viewer = createViewer(sendToApp);
listenToApp((message) => viewer.handle(message));
sendToApp({ type: 'ready' });
