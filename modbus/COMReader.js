module.exports = (ModbusClient, port, callback) => {
    this.client = new ModbusClient();

    this.client.connectRTU(port, {baudRate: 9600}, () => {
        callback((id, resultCallback, errorCallback) => {
            this.client.setID(id);

            this.client.readHoldingRegisters(0, 6)
                        .then(resultCallback)
                        .catch(errorCallback);
        });
    });
};