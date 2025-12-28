import { Component, NgZone, ChangeDetectorRef, OnDestroy } from '@angular/core';
import Peer, { DataConnection } from 'peerjs';
import { CommonModule } from '@angular/common';

interface Notification {
    id: number;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {

    ROWS = 6;
    COLS = 7;

    board: (string | null)[][] = [];
    myColor: 'red' | 'yellow' | null = null;
    turn: 'red' | 'yellow' = 'red';

    peer!: Peer;
    conn: DataConnection | null = null;

    peerId = '';
    status = '';
    gameOver = false;
    winner: 'red' | 'yellow' | null = null;
    
    // Connection states
    isConnecting = false;
    isConnected = false;
    connectionError = '';
    
    // Notifications
    notifications: Notification[] = [];
    private notificationId = 0;
    
    // Confetti
    confettiPieces: { left: number; delay: number; duration: number; color: string; size: number }[] = [];
    showVictoryOverlay = false;

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {
        this.resetBoard();
        this.initializePeer();
    }

    ngOnDestroy() {
        this.conn?.close();
        this.peer?.destroy();
    }

    private initializePeer() {
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        this.peer = new Peer(id, { debug: 2 });

        this.peer.on('open', id => {
            this.ngZone.run(() => {
                this.peerId = id;
                this.status = `Your Room ID: ${id}`;
                this.showNotification(`Room created! Your ID: ${id}`, 'info');
            });
        });

        this.peer.on('connection', connection => {
            this.ngZone.run(() => {
                this.conn = connection;
                this.myColor = 'red';
                this.isConnected = true;
                this.isConnecting = false;
                this.setupConnectionHandlers(connection);
                this.status = 'Player joined. You are Red 🔴';
                this.showNotification('🎮 A player has joined! Game is ready!', 'success');
                
                // Send welcome message to joiner
                setTimeout(() => {
                    this.conn?.send({ type: 'welcome', message: 'Connected to host!' });
                }, 100);
            });
        });

        this.peer.on('error', err => {
            this.ngZone.run(() => {
                console.error('Peer error:', err);
                this.connectionError = err.message || 'Connection failed';
                this.isConnecting = false;
                this.showNotification(`Connection error: ${err.type}`, 'error');
            });
        });

        this.peer.on('disconnected', () => {
            this.ngZone.run(() => {
                this.showNotification('Disconnected from server. Reconnecting...', 'warning');
                this.peer.reconnect();
            });
        });
    }

    private setupConnectionHandlers(connection: DataConnection) {
        connection.on('open', () => {
            this.ngZone.run(() => {
                this.isConnected = true;
                this.isConnecting = false;
                this.listen();
                this.cdr.detectChanges();
            });
        });

        connection.on('close', () => {
            this.ngZone.run(() => {
                this.isConnected = false;
                this.conn = null;
                this.showNotification('⚠️ Opponent disconnected!', 'warning');
                this.status = 'Opponent left the game';
            });
        });

        connection.on('error', err => {
            this.ngZone.run(() => {
                console.error('Connection error:', err);
                this.showNotification('Connection error occurred', 'error');
            });
        });
    }

    resetBoard() {
        this.board = Array.from({ length: this.ROWS }, () =>
            Array(this.COLS).fill(null)
        );
        this.gameOver = false;
        this.winner = null;
        this.turn = 'red';
        this.showVictoryOverlay = false;
        this.confettiPieces = [];
        if (this.conn && this.isConnected) {
            this.status = this.myColor === 'red' ? 'Connected. You are Red 🔴' : 'Connected. You are Yellow 🟡';
        }
    }

    createRoom() {
        this.myColor = 'red';
        this.status = `Room created! Share ID: ${this.peerId}`;
        this.showNotification('Room created! Waiting for opponent...', 'info');
    }

    joinRoom(roomId: string) {
        if (!roomId || roomId.length !== 4) {
            this.showNotification('Please enter a valid 4-digit Room ID', 'error');
            return;
        }

        this.isConnecting = true;
        this.connectionError = '';
        this.status = 'Connecting...';
        
        this.conn = this.peer.connect(roomId, {
            reliable: true
        });
        this.myColor = 'yellow';

        const timeout = setTimeout(() => {
            if (this.isConnecting) {
                this.ngZone.run(() => {
                    this.isConnecting = false;
                    this.connectionError = 'Connection timed out';
                    this.showNotification('Connection timed out. Please try again.', 'error');
                    this.status = 'Connection failed';
                });
            }
        }, 10000);

        this.conn.on('open', () => {
            clearTimeout(timeout);
            this.ngZone.run(() => {
                this.isConnected = true;
                this.isConnecting = false;
                this.setupConnectionHandlers(this.conn!);
                this.listen();
                this.status = 'Connected! You are Yellow 🟡';
                this.showNotification('🎮 Connected! You are Yellow. Red goes first!', 'success');
            });
        });

        this.conn.on('error', err => {
            clearTimeout(timeout);
            this.ngZone.run(() => {
                this.isConnecting = false;
                this.connectionError = 'Failed to connect';
                this.showNotification('Failed to join room. Check the Room ID.', 'error');
                this.status = 'Connection failed';
            });
        });
    }

    listen() {
        if (!this.conn) return;
        
        this.conn.on('data', (data: any) => {
            console.log('Received data:', data);
            this.ngZone.run(() => {
                if (data.type === 'move') {
                    this.dropDisc(data.col, data.color);
                } else if (data.type === 'restart') {
                    this.resetBoard();
                    this.showNotification('🔄 Opponent wants to play again!', 'info');
                } else if (data.type === 'welcome') {
                    this.showNotification('✅ Connected to opponent!', 'success');
                }
                this.cdr.detectChanges();
            });
        });
    }

    play(col: number) {
        if (this.gameOver || this.turn !== this.myColor) return;
        if (!this.isConnected) {
            this.showNotification('Wait for opponent to join!', 'warning');
            return;
        }

        if (this.dropDisc(col, this.myColor!)) {
            this.conn?.send({ type: 'move', col, color: this.myColor });
        }
    }

    dropDisc(col: number, color: 'red' | 'yellow') {
        if (this.gameOver) return false;
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (!this.board[r][col]) {
                const newRow = [...this.board[r]];
                newRow[col] = color;
                this.board[r] = newRow;

                if (this.checkWinner(r, col, color)) {
                    this.gameOver = true;
                    this.winner = color;
                    this.status = `${color.toUpperCase()} WINS! 🏆`;
                    this.triggerVictory(color);
                } else if (this.checkDraw()) {
                    this.gameOver = true;
                    this.status = "It's a DRAW! 🤝";
                    this.showNotification("Game ended in a draw!", 'info');
                } else {
                    this.turn = color === 'red' ? 'yellow' : 'red';
                }
                return true;
            }
        }
        return false;
    }

    checkDraw(): boolean {
        return this.board[0].every(cell => cell !== null);
    }

    triggerVictory(color: 'red' | 'yellow') {
        this.showVictoryOverlay = true;
        this.generateConfetti();
        
        const isWinner = color === this.myColor;
        if (isWinner) {
            this.showNotification('🎉 Congratulations! You WON!', 'success');
        } else {
            this.showNotification('😔 You lost! Better luck next time!', 'info');
        }
    }

    generateConfetti() {
        const colors = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316'];
        this.confettiPieces = [];
        
        for (let i = 0; i < 100; i++) {
            this.confettiPieces.push({
                left: Math.random() * 100,
                delay: Math.random() * 3,
                duration: 3 + Math.random() * 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 8 + Math.random() * 8
            });
        }
    }

    restart() {
        this.resetBoard();
        this.conn?.send({ type: 'restart' });
        this.showNotification('🔄 New game started!', 'info');
    }

    checkWinner(r: number, c: number, color: string): boolean {
        const directions = [
            [0, 1],  // Horizontal
            [1, 0],  // Vertical
            [1, 1],  // Diagonal /
            [1, -1]  // Diagonal \
        ];

        for (const [dr, dc] of directions) {
            let count = 1;
            for (let i = 1; i < 4; i++) {
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr >= 0 && nr < this.ROWS && nc >= 0 && nc < this.COLS && this.board[nr][nc] === color) {
                    count++;
                } else break;
            }
            for (let i = 1; i < 4; i++) {
                const nr = r - dr * i;
                const nc = c - dc * i;
                if (nr >= 0 && nr < this.ROWS && nc >= 0 && nc < this.COLS && this.board[nr][nc] === color) {
                    count++;
                } else break;
            }
            if (count >= 4) return true;
        }
        return false;
    }

    // Notification System
    showNotification(message: string, type: 'success' | 'info' | 'warning' | 'error') {
        const notification: Notification = {
            id: ++this.notificationId,
            message,
            type
        };
        this.notifications.push(notification);
        
        setTimeout(() => {
            this.removeNotification(notification.id);
        }, 4000);
    }

    removeNotification(id: number) {
        this.ngZone.run(() => {
            this.notifications = this.notifications.filter(n => n.id !== id);
            this.cdr.detectChanges();
        });
    }

    copyRoomId() {
        navigator.clipboard.writeText(this.peerId).then(() => {
            this.showNotification('Room ID copied to clipboard!', 'success');
        });
    }
}
