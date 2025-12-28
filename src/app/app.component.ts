import { Component, NgZone, ChangeDetectorRef } from '@angular/core';
import Peer, { DataConnection } from 'peerjs';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {

    ROWS = 6;
    COLS = 7;

    board: (string | null)[][] = [];
    myColor: 'red' | 'yellow' | null = null;
    turn: 'red' | 'yellow' = 'red';

    peer!: Peer;
    conn!: DataConnection;

    peerId = '';
    status = '';
    gameOver = false;
    winner: 'red' | 'yellow' | null = null;

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {
        this.resetBoard();
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        this.peer = new Peer(id, { debug: 2 }); // Enable debug logs

        this.peer.on('open', id => {
            this.ngZone.run(() => {
                this.peerId = id;
                this.status = `Your Room ID: ${id}`;
            });
        });

        this.peer.on('connection', connection => {
            this.ngZone.run(() => {
                this.conn = connection;
                this.myColor = 'red';
                this.listen();
                this.status = 'Player joined. You are Red';
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
        if (this.conn) { // maintain connection status
            this.status = this.myColor === 'red' ? 'Connected. You are Red.' : 'Connected. You are Yellow.';
        }
    }

    createRoom() {
        this.myColor = 'red';
        this.status = 'Room created. Share Room ID.';
    }

    joinRoom(roomId: string) {
        this.conn = this.peer.connect(roomId);
        this.myColor = 'yellow';

        this.conn.on('open', () => {
            this.ngZone.run(() => {
                this.listen();
                this.status = 'Connected. You are Yellow.';
            });
        });
    }

    listen() {
        this.conn.on('data', (data: any) => {
            console.log('Received data:', data);
            this.ngZone.run(() => {
                if (data.type === 'move') {
                    this.dropDisc(data.col, data.color);
                } else if (data.type === 'restart') {
                    this.resetBoard();
                }
                this.cdr.detectChanges(); // Force update
            });
        });
    }

    play(col: number) {
        if (this.gameOver || this.turn !== this.myColor) return;

        if (this.dropDisc(col, this.myColor!)) {
            this.conn?.send({ type: 'move', col, color: this.myColor });
        }
    }

    dropDisc(col: number, color: 'red' | 'yellow') {
        if (this.gameOver) return false;
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (!this.board[r][col]) {
                const newRow = [...this.board[r]]; // Create new reference
                newRow[col] = color;
                this.board[r] = newRow; // Update row reference

                if (this.checkWinner(r, col, color)) {
                    this.gameOver = true;
                    this.winner = color;
                    this.status = `${color.toUpperCase()} WINS!`;
                } else {
                    this.turn = color === 'red' ? 'yellow' : 'red';
                }
                return true;
            }
        }
        return false;
    }

    restart() {
        this.resetBoard();
        this.conn?.send({ type: 'restart' });
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
            // Check forward
            for (let i = 1; i < 4; i++) {
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr >= 0 && nr < this.ROWS && nc >= 0 && nc < this.COLS && this.board[nr][nc] === color) {
                    count++;
                } else break;
            }
            // Check backward
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
}

