/// <reference path='./typings/tsd.d.ts' />
var fs = require('fs');
var path = require('path');
var Response = (function () {
    function Response(requestGuid, data) {
        this.requestGuid = requestGuid;
        this.stamp = new Date();
        this.data = data;
    }
    return Response;
})();
var SyncNodeServer = (function () {
    function SyncNodeServer(namespace, io, defaultData) {
        var _this = this;
        if (defaultData === void 0) { defaultData = {}; }
        this.namespace = namespace;
        this.directory = 'data';
        this.io = io;
        this.get(function (data) {
            _this.data = data;
            if (!_this.data) {
                _this.data = JSON.parse(JSON.stringify(defaultData)); // Use a copy for immutability
            }
            _this.start();
        });
    }
    SyncNodeServer.prototype.doMerge = function (obj, merge) {
        var _this = this;
        if (typeof merge !== 'object')
            return merge;
        Object.keys(merge).forEach(function (key) {
            if (key === 'lastModified' && obj[key] > merge[key]) {
                console.error('Server version lastModified GREATER THAN merge lastModified', obj[key], merge[key]);
            }
            if (key === 'meta') {
            }
            else if (key === '__remove') {
                delete obj[merge[key]];
            }
            else {
                var nextObj = (obj[key] || {});
                obj[key] = _this.doMerge(nextObj, merge[key]);
            }
        });
        return obj;
    };
    SyncNodeServer.prototype.resetData = function (newData) {
        this.data = JSON.parse(JSON.stringify(newData)); // Use a copy for immutability
        this.persist();
        this.ioNamespace.emit('latest', this.data);
    };
    SyncNodeServer.prototype.start = function () {
        var _this = this;
        this.ioNamespace = this.io.of('/' + this.namespace);
        this.ioNamespace.on('connection', function (socket) {
            console.log('someone connected to ' + _this.namespace);
            socket.on('getlatest', function (clientLastModified) {
                console.log('getlatest', _this.data.lastModified, clientLastModified);
                if (!clientLastModified || clientLastModified < _this.data.lastModified) {
                    socket.emit('latest', _this.data);
                }
                else {
                    console.log('already has latest.');
                    socket.emit('latest', null);
                }
            });
            socket.on('update', function (request) {
                var merge = request.data;
                _this.doMerge(_this.data, merge);
                _this.persist();
                socket.emit('updateResponse', new Response(request.requestGuid, null));
                socket.broadcast.emit('update', merge);
                if (_this.onMerge)
                    _this.onMerge(merge);
            });
        });
    };
    SyncNodeServer.prototype.get = function (callback) {
        var path = this.buildFilePath();
        fs.readFile(path, 'utf8', function (err, data) {
            if (err) {
                if (err.code === 'ENOENT') {
                    callback(null);
                }
                else {
                    console.error('Failed to read ' + path + ': ' + err);
                    callback(null);
                }
            }
            else {
                callback(JSON.parse(data));
            }
        });
    };
    SyncNodeServer.prototype.persist = function () {
        var _this = this;
        var path = this.buildFilePath();
        console.log(path);
        fs.mkdir(this.directory, null, function (err) {
            if (err) {
                // ignore the error if the folder already exists
                if (err.code != 'EEXIST') {
                    console.error('Failed to create folder ' + _this.directory + ': ' + err);
                    return;
                }
            }
            fs.writeFile(path, JSON.stringify(_this.data), function (err) {
                if (err) {
                    console.error('Failed to write ' + path + ': ' + err);
                }
            });
        });
    };
    SyncNodeServer.prototype.buildFilePath = function () {
        return path.join(this.directory, this.namespace + '.json');
    };
    return SyncNodeServer;
})();
exports.SyncNodeServer = SyncNodeServer;
