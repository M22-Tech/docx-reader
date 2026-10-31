import '../model/raw.css';
import '../model/rendered.css';
import '../formats/docx/docx.css';
import './viewer.css';
import { listenToApp, sendToApp } from './transport';
import { createViewer } from './viewer';

const viewer = createViewer(sendToApp);
listenToApp((message) => viewer.handle(message));
sendToApp({ type: 'ready' });
