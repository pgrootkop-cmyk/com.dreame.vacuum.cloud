'use strict';

module.exports = {
  async getDeviceData({ homey, query }) {
    const device = await homey.app._findVacuumDevice(query.did);
    return device ? homey.app.getVacuumDataForDevice(device) : null;
  },
};
