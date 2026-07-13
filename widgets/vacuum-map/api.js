'use strict';

module.exports = {
  async getDeviceData({ homey, query }) {
    const device = await homey.app._findVacuumDevice(query.did);
    return device ? homey.app.getVacuumDataForDevice(device) : null;
  },

  async getMapData({ homey, query }) {
    const did = query.did;
    const device = await homey.app._findVacuumDevice(did);
    if (!device) return null;
    const dreameId = device.getData().id;
    return homey.app.getRenderedMap(dreameId, query.colorScheme);
  },

  async getRobotPosition({ homey, query }) {
    const did = query.did;
    const device = await homey.app._findVacuumDevice(did);
    if (!device) return null;
    return device.getRobotPosition();
  },
};
