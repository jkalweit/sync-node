/// <reference path='./typings/tsd.d.ts' />

import fs = require('fs');
import path = require('path');
import socketio = require('socket.io');

interface Request {
	requestGuid?: string;
	stamp?: Date;
	data?: any;
}


class Response {
	requestGuid: string;
	stamp: Date;
	data: any;

	constructor(requestGuid: string, data?: any) {
		this.requestGuid = requestGuid;
		this.stamp = new Date();
		this.data = data;
	}
}

export class SyncNodeServer {
	namespace: string;
    	directory: string;
	io: SocketIO.Server;
	ioNamespace: SocketIO.Namespace;
	data: any;
	onMerge: (merge: any) => void;

	constructor(namespace: string, io: SocketIO.Server, defaultData: any = {}) {
		this.namespace  = namespace;
		this.directory = 'data';
		this.io = io;
		
		this.get((data: any) => {
			this.data = data;
			if(!this.data) {
				this.data = JSON.parse(JSON.stringify(defaultData)); // Use a copy for immutability
			}
			this.start();
		});
	}

	doMerge(obj: any, merge: any) {




		if (typeof merge !== 'object') return merge;
		Object.keys(merge).forEach((key: string) => {
			if(key === 'lastModified' && obj[key] as any > merge[key]) {
				console.error('Server version lastModified GREATER THAN merge lastModified', obj[key], merge[key]);
			}
			if(key === 'meta') {

			} else if (key === '__remove') {
				delete obj[merge[key]];
			} else {
				var nextObj = (obj[key] || {}) as any;

				obj[key] = this.doMerge(nextObj, merge[key]);
			}
		});
		return obj;
	}
	resetData(newData: any) {
		this.data = JSON.parse(JSON.stringify(newData)); // Use a copy for immutability
		this.persist();
		this.ioNamespace.emit('latest', this.data);
	}
	start() {
		this.ioNamespace = this.io.of('/' + this.namespace);
		this.ioNamespace.on('connection', (socket: SocketIO.Socket) => {
			console.log('someone connected to ' + this.namespace);

			socket.on('getlatest', (clientLastModified: string) => {
				console.log('getlatest', this.data.lastModified, clientLastModified);
				if (!clientLastModified || clientLastModified < this.data.lastModified) {
					socket.emit('latest', this.data);
				} else {
					console.log('already has latest.');
					socket.emit('latest', null);
				}
			});



			socket.on('update', (request: Request) => {
				var merge = request.data;
				this.doMerge(this.data, merge);
				this.persist();
				socket.emit('updateResponse', new Response(request.requestGuid, null));
				socket.broadcast.emit('update', merge);


				if(this.onMerge) this.onMerge(merge);
			});
		});
	}



    get(callback: (data: any) => void) {
        var path = this.buildFilePath();

        fs.readFile(path, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    callback(null);
                } else {
                    console.error('Failed to read ' + path + ': ' + err);
                    callback(null);
                }
            } else {
                callback(JSON.parse(data));
            }
        });
    }

    persist() {
        var path = this.buildFilePath();
        console.log(path);
        fs.mkdir(this.directory, null, (err) => {
            if (err) {
                // ignore the error if the folder already exists
                if (err.code != 'EEXIST') {
                    console.error('Failed to create folder ' + this.directory + ': ' + err);
                    return;
                }
            }

            fs.writeFile(path, JSON.stringify(this.data), (err) => {
                if (err) {
                    console.error('Failed to write ' + path + ': ' + err);
                }
            });
        });
    }

    buildFilePath(): string {
        return path.join(this.directory, this.namespace + '.json');
    }

}
