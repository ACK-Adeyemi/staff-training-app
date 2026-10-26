import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createT, languages } from '@sta/content';
import { Button } from '@sta/ui';
import { App } from './App';
import { bootstrap } from './demo/bootstrap';
import { listenEarly } from './demo/earlyShortcut';
import './styles/app.css';

const t = createT(languages['en-GB'].messages);
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
const root = createRoot(container);

listenEarly();
bootstrap(window.location.search).then(
  (booted) => {
    root.render(
      <StrictMode>
        <App booted={booted} />
      </StrictMode>,
    );
  },
  () => {
    root.render(
      <main className="mx-auto max-w-xl p-6">
        <h1 className="mb-4 text-2xl font-bold">{t('shell.errorTitle')}</h1>
        <p role="alert" className="mb-6">
          {t('errors.storage')}
        </p>
        <Button
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('errors.reload')}
        </Button>
      </main>,
    );
  },
);
