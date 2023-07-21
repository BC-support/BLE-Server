# BLE-Server
 
NOTE: There's a more detailed guide to installing nodejs and the details of working with a Bluetooth USB adapter at  
https://github.com/mahalia-bone/mahalia-ble-server  
The guide here assumes your host computer has working Bluetooth hardware along with nodejs and npm installed.  

# Installation  
## Download mahalia-ble-server
```
git clone git@github.com:BC-support/BLE-Server.git
cd BLE-Server
npm install
```
# Operation
You can scan for nearby BLE devices with
```
sudo node mahalia-ble-server.js --scan
```
In the above command, 'node' may be 'nodejs' depending on your host system configuration.
This will show any nearby PHL that's running the mahalia-ble-peripheral.js program.

Connect to a PHL from the above scan with
```
sudo node mahalia-ble-server.js Mahalia --daemon
```
Once the connection is made, you can communicate with the PHL via a netcat connection with the localhost port 33337. The BLE server will allow interactive mode operation with the mha process on the PHL.


