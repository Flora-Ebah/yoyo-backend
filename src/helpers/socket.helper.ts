import { Server as SocketIOServer, Socket } from 'socket.io';

export class SocketIOHelper {
	private io: SocketIOServer;

	constructor(server) {
		this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Permettre les requêtes depuis n'importe quelle origine
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket: Socket) => {
      console.log('Nouvelle connexion WebSocket');
      this.io.emit('message', 'Un nouveau client s\'est connecté');
    });
  }

  public getIo(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.IO non initialisé. Veuillez appeler le constructeur avec un serveur avant de l\'utiliser.');
    }
    return this.io;
  }
}
