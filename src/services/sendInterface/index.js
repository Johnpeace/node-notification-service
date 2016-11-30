'use strict';
const notificationServices = {
  firebase: require('./adapters/firebase')
};

class SendInterface {

  /**
   * This method sends the given notifications to all devices via the appropriate service.
   * If multiple notifications are given, only the message of the first is respected.
   * The returned promise resolves, if at least one notification was sent successfully.
   * The returned promise rejects, if all notifications fail.
   */
  send(notifications, devices) {
    return new Promise((resolve, reject) => {
      let results = {};

      // group devices and notifications by service
      let groupsByService = this._groupByService(notifications, devices);
      let allPromises = [];

      for (let service in groupsByService) {
        let serviceNotifications = groupsByService[service].notifications;
        let serviceDevices = groupsByService[service].devices;

        if (notificationServices.hasOwnProperty(service)) {
          let promise = notificationServices[service].send(serviceNotifications, serviceDevices);
          allPromises.push(promise);
        } else {
          // there is no interface for this service
          // TODO: handle error
        }
      }

      Promise.all(allPromises).then((responses) => {
        let accumulatedResponses = {
          success: 0,
          failure: 0,
          results: []
        };

        responses.forEach((response) => {
          this._addResponse(accumulatedResponses, response);
        });

        if (accumulatedResponses.failure == notifications.length) {
          reject(accumulatedResponses);
        } else {
          resolve(accumulatedResponses);
        }
      });
    });
  }

  _addResponse(accumulatedResponses, response) {
    accumulatedResponses.success += response.success;
    accumulatedResponses.failure += response.failure;
    accumulatedResponses.results = accumulatedResponses.results.concat(response.results);
    return accumulatedResponses;
  }

  _groupByService(notifications, devices) {
    return devices.reduce((groupsByService, device, index) => {
      if (!groupsByService.hasOwnProperty(device.service)) {
        groupsByService[device.service] = {
          notifications: [],
          devices: []
        };
      }

      groupsByService[device.service].notifications.push(notifications[index]);
      groupsByService[device.service].devices.push(device);

      return groupsByService;
    }, {});
  }

}

module.exports = new SendInterface();
