const ModbusClient = require("./modbus/index.js")
const Vue          = require('vue/dist/vue.min.js')
const path         = require('path')
const fs           = require('fs')
const os           = require('os')
const swal         = require('sweetalert')
const Config       = require('electron-config')
const excel        = require('node-excel-export')
const remote       = require('electron').remote
const dialog       = remote.dialog

const files = {
    log     : path.join(os.homedir(), 'db.json')
}

const Reader       = {read : null}
const config       = new Config()

const onError = error => error && console.log(`${error.errno}: ${error.message}`)
const log     = data => fs.appendFile(files.log, JSON.stringify(data) + os.EOL, onError)

const styles = {
    header: {
        font : {
            color : {
                rgb : 'FF000000'
            },
            sz : 14,
            bold : true
        },
        alignment : {
            horizontal : 'center'
        }
    }
}

let modbusConnection = null

const app = new Vue({
    el : "#app",

    data : {
        address         : 1,
        device          : "COM1",
        logPath         : files.log,
        activePage      : "settings",
        isReady         : false,
        sidebarDisabled : false,
        intervalId      : false,
        active          : false,
        devLastClick    : 0,
        devClickNumber  : 0,
        ph : {
            mode         : "once",
            fault        : 0,
            frequency    : 5,
            interval     : 60,
            currentValue : 0,
            lastValue    : 0,
            data         : [],
            specification : {
                date: {
                    displayName: 'Дата і час',
                    headerStyle: styles.header,
                    width: 120
                },
                ph: {
                    displayName: 'pH',
                    headerStyle: styles.header,
                    width: '10'
                },
                temp: {
                    displayName: 'Температура',
                    headerStyle: styles.header,
                    width: 120
                }
            }
        },
        temp : {
            fault        : 0,
            currentValue : 0,
            lastValue    : 0
        },
        orp : {
            mode         : "once",
            fault        : 0,
            frequency    : 5,
            interval     : 60,
            currentValue : 0,
            lastValue    : 0,
            data         : [],
            specification : {
                date: {
                    displayName: 'Дата і час',
                    headerStyle: styles.header,
                    width: 120
                },
                orp: {
                    displayName: 'ORP',
                    headerStyle: styles.header,
                    width: '10'
                }
            }
        }
    },

    created: function () {
        this.device     = config.get('device')    || this.device
        this.ph.fault   = config.get('phFault')   || this.ph.fault
        this.temp.fault = config.get('tempFault') || this.temp.fault
        this.orp.fault  = config.get('orpFault')  || this.orp.fault
    },

    methods : {
        devtools : function () {
            const now = new Date().getTime();

            if((now - this.devLastClick) < 200){
                if(this.devClickNumber === 1){
                    remote.getCurrentWindow().openDevTools()

                    this.devClickNumber = 0;
                    this.devLastClick = 0;
                }else{
                    this.devClickNumber++;
                    this.devLastClick = now;
                }
            }else{
                this.devClickNumber = 0;
                this.devLastClick = now;
            }
        },

        connect : function () {
            this.isReady = true

            modbusConnection = ModbusClient.initModbus(ModbusClient, this.device, read => {
                Reader.read = read
            })

            modbusConnection.setLengthErrorHandler(() => {
                this.stopFrequency()

                swal('Помилка!', 'Ймовірніше за все, датчик знаходиться в неправильному режимі', 'error')
            })
        },

        openPage : function (page) {
            if(this.sidebarDisabled){
                return
            }

            if(!this.isReady){
                this.connect()
            }

            this.activePage = page
        },

        runFrequency : function () {
            if (this.orp.frequency < 1) {
                swal('Помилка!', 'Період має бути цілим числом.', 'error')

                return
            }

            this.active = this.sidebarDisabled = true
            this[this.activePage].data = [];

            const frequency = 1000 * parseInt(this[this.activePage].frequency) * parseInt(this[this.activePage].interval)

            this.intervalId = setInterval(this.send.bind(this), frequency)
        },

        stopFrequency : function () {
            this.active = this.sidebarDisabled = false

            clearInterval(this.intervalId)

            this.intervalId = false
        },

        send : function () {
            const onResponse = data => {
                const info = data.data.map(symbol => String.fromCharCode(symbol)).join('')

                if (this.activePage === 'ph') {
                    this.ph.lastValue    = this.ph.currentValue
                    this.ph.currentValue = (parseFloat(info.substr(0, 5)) + parseFloat(this.ph.fault)).toFixed(2)

                    this.temp.lastValue    = this.temp.currentValue
                    this.temp.currentValue = (parseFloat(info.substr(5)) + parseFloat(this.temp.fault)).toFixed(2)

                    if (this.active) {
                        this.ph.data.push({
                            date: new Date(), 
                            ph: this.ph.currentValue, 
                            temp: this.temp.currentValue
                        })
                    }
                }

                if (this.activePage === 'orp') {
                    this.orp.lastValue    = this.orp.currentValue
                    this.orp.currentValue = (parseFloat(info.substr(0, 3) + '.' + info.substr(3, 1)) + parseFloat(this.orp.fault)).toFixed(2)
                        
                    if (this.active) {
                        this.orp.data.push({
                            date: new Date(), 
                            orp: this.orp.currentValue
                        })
                    }
                }
            }

            if (this.activePage === 'ph') {
                modbusConnection.setDataLength(16)
            }

            if (this.activePage === 'orp') {
                modbusConnection.setDataLength(12)
            }

            Reader.read(this.address, onResponse, onError)
        },

        saveConfig : function () {
            config.set('device', this.device)
            config.set('phFault', this.ph.fault)
            config.set('tempFault', this.temp.fault)
            config.set('orpFault', this.orp.fault)
        },

        createExcelFile : function () {
            const report = excel.buildExport([
                {
                  name: 'Report',
                  specification: this[this.activePage].specification,
                  data: this[this.activePage].data
                }
            ])

            dialog.showSaveDialog({
                properties: ['openDirectory'],
                title : "Виберіть ім`я файлу",
                defaultPath : `${this.activePage}.xlsx`
            }, path  => fs.writeFile(path, report, () => {}))
        }
    }
})