import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { handleConnection } from './connectionHandler.js';
import { handleDashboardConnect, handleDashboardDisconnect, handleDashboardPing } from './handlers/dashboardHandler.js';
import { ConnectedClient } from '../services/presence.service.js';

export function setupWebSocketGateway(server: Server) {
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (socket: WebSocket) => {
        handleConnection(socket);
    });

    console.log('⚡ Complete WebSocket Gateway initialized at /ws');
    console.log('📊 Dashboard WebSocket connections supported via message types');
    return wss;
}