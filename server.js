// TableFlow Pro - Local Server Runner
import http from 'http';
import { createApp } from './src/app.js';
import { bootstrapDatabase } from './src/bootstrap.js';
import { wsHub } from './src/modules/realtime/websocket-hub.js';
import { OutboxWorker } from './src/modules/outbox/outbox.worker.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
    const dbClient = await bootstrapDatabase();
    const app = createApp(dbClient);

    const server = http.createServer(app);
    wsHub.attach(server);

    const outboxWorker = new OutboxWorker({ db: dbClient });
    outboxWorker.start();

    server.listen(PORT, () => {
        console.log(`\n===============================================================`);
        console.log(`TABLEFLOW PRO (ROP) POS SERVER RUNNING`);
        console.log(`===============================================================`);
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`Outlet: DUM HOUSE (Indiranagar, Bangalore)`);
        console.log(`Ready for order taking, kitchen display, and state machine fulfillment.\n`);
    });

    return server;
}

startServer().catch(err => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
});
