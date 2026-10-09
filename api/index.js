import { getApp } from '../src/bootstrap.js';

let appPromise = null;

function getInitializedApp() {
    if (!appPromise) {
        appPromise = getApp();
    }
    return appPromise;
}

export default async function handler(req, res) {
    try {
        const app = await getInitializedApp();
        return new Promise((resolve) => {
            res.on('finish', resolve);
            res.on('close', resolve);
            app(req, res);
        });
    } catch (err) {
        console.error('Vercel API Handler Error:', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}
