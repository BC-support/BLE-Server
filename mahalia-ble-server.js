/*
 * Mahalia BLE Server
 *
 * This software is intended to be run on the PC and translates data from an
 * openMHA client to a remote openMHA process via a BLE connection.
 *
 * Licenced under GPL-2.0.
 * Copyright (C) 2018 Christopher Obbard <chris@64studio.com>
 */

// import modules & functions
var noble = require('@abandonware/noble');
var net = require('net');

// the port used for the openMHA socket interface
var mhaPort = 33337;

// the name shown to clients
var bleLocalName = 'Mahalia';

// BLE service UUIDs
//  bleServiceUUIDs[0] is the Mahalia service
var bleServiceUUIDs = ['12ab'];

// BLE characteristic UUIDs
//  bleCharacteristicUUIDs[0] is the openMHA characteristic
//  bleCharacteristicUUIDs[1] is the Wi-Fi characteristic
var bleCharacteristicUUIDs = ['34cd', '56ef'];

// the maximum amount of bytes to transfer over the BLE interface
var bleMaxBytes = 100;

// in BLE scan mode or not
var scanMode = false;


function help() {
    console.log('');
    console.log('usage:');
    console.log('  "nodejs mahalia-ble-server.js --scan"        scans for openMHA BLE devices');
    console.log('  "nodejs mahalia-ble-server.js <ble_device_name> --daemon"  starts the openMHA BLE translation daemon, trying to connect to the specified BLE device');
    console.log('  "nodejs mahalia-ble-server.js <ble_device_name> --disable-wifi"  disables Wi-Fi on the Mahalia device, trying to connect to the specified BLE device');
    console.log('  "nodejs mahalia-ble-server.js <ble_device_name --enable-wifi"   enables Wi-Fi on the Mahalia device, trying to connect to the specified BLE device');
    process.exit(1);
}

// read the script arguments
var args = process.argv.slice(2);
if ((args.length == 1 && args[0] == '--scan')) {
    scanMode = true;
    console.log('press Ctrl-C to exit scan mode.');
}
else if (args.length == 2) {
    bleLocalName = args[0];
    console.log('trying to connect to BLE device \'' + bleLocalName + '\'');
}
else {
    console.log('ERROR: incorrect arguments given.');
    help();
}


// start scanning BLE for peripherals
noble.on('stateChange', function(state) {
    if (state === 'poweredOn') {
        noble.startScanning();
    } else {
        noble.stopScanning();
    }
});


// peripheral discovered event
noble.on('discover', function(peripheral) {
    // check whether the peripheral is advertising its name
    if (typeof peripheral.advertisement == 'undefined' ||
            typeof peripheral.advertisement.localName == 'undefined') {
        console.log('[BLE] ' + peripheral.address + ' peripheral name not advertised; skipping');
        return;
    }

    var peripheralName = peripheral.advertisement.localName;
    var peripheralAddress = peripheral.address;

    // handle scanning operation
    if (scanMode) {
        console.log('found Mahalia BLE Peripheral \'' + peripheralName +
            '\' address: ' + peripheralAddress);
        return;
    }

    // check if the advertised device name matches the parameter
    else if (!peripheralName === bleLocalName) {
        console.log('[BLE] ' + peripheralAddress + ' peripheral name not recognised: ' +
            peripheralName + '; skipping');
        return;
    }


    // found the device
    noble.stopScanning();
    console.log('[BLE] Connected to Mahalia BLE Peripheral \'' + peripheralName +
        '\' address: ' + peripheralAddress);

    // handle disconnect
    peripheral.on('disconnect', function() {
        console.log('peripheral disconnect');
        process.exit();
    });

    // connect
    peripheral.connect(function() {
        peripheral.discoverServices(bleServiceUUIDs, function(error, services) {
            var mhaService = services[0];
            mhaService.discoverCharacteristics(bleCharacteristicUUIDs, function(error, characteristics) {

                // the characteristics are hardcoded in this order
                var mhaCharacteristic = characteristics[0];
                var wifiCharacteristic = characteristics[1];
                var command = args[1];

                // disable Wi-Fi hotspot then quit
                if (command === '--disable-wifi') {
                    wifiCharacteristic.write(new Buffer('0'), false, function(error) {
                        console.log('Wi-Fi disabled.');
                        process.exit();
                    });
                }

                // enable Wi-Fi hotspot then quit
                else if (command === '--enable-wifi') {
                    wifiCharacteristic.write(new Buffer('1'), false, function(error) {
                        console.log('Wi-Fi enabled.');
                        process.exit();
                    });
                }

                // run daemon
                else if (command === '--daemon') {
                    createMHAServer(mhaCharacteristic);
                }

                // error case
                else {
                    console.log('ERROR: incorrect arguments given.');
                    help();
                }
            });
        });
    });
});


// this function creates a socket interface on <mhaPort> and redirects the
//   input to the BLE interface as well as redirecting any data transmitted
//   from the BLE interface to the socket interface
function createMHAServer(mhaCharacteristic) {
    // one socket is created per client, only one client may connect to the BLE
    //   at a time; the last connected client gets the priority
    var mhaServer = net.createServer(function(socket) {
        // whether the client is still connected
        var connected = true;
        console.log('[MHA] client connected');

        socket.on('end', function() {
            console.log('[MHA] client disconnected');
            connected = false;
        });

        // event listener for data coming from dummy openMHA socket interface
        socket.on('data', function(data) {
            console.log('[MHA] RX: ' +
                data.toString().replace(/(?:\r\n|\r|\n)/g, ''));

            // split the data into chunks and send each chunk over BLE
            var splitData = stringSplitFixedLength(data.toString(), bleMaxBytes);
            splitData.forEach(function(element) {
                console.log('[BLE] TX: ' +
                    element.replace(/(?:\r\n|\r|\n)/g, ''));
                mhaCharacteristic.write(new Buffer(element));
            });
        });

        // event listener for BLE data
        mhaCharacteristic.on('data', function(data, isNotification) {
            var tmp = data.toString('utf8');
            console.log('[BLE] RX: ' + tmp.replace(/(?:\r\n|\r|\n)/g, ''));

            // only send data if the client is still connected
            if (connected)
                socket.write(tmp);
        });

        // subscribe to the BLE read notification
        mhaCharacteristic.subscribe(function(error) {
            console.log('[BLE] subscribed');
        });
    });

    // after the server is created
    mhaServer.on('listening', function() {
        console.log('[MHA] server now listening on port: ' + mhaPort);
    });

    // start the dummy openMHA socket server
    mhaServer.listen(mhaPort, '127.0.0.1');
}


// splits a string into array of strings with a fixed length
function stringSplitFixedLength(str, length) {
    // match any non-whitespace or whitespace up to <length> times globally
    var re = new RegExp("([\\S\\s]{1," + length + "})", 'g');
    return str.match(re);
}
