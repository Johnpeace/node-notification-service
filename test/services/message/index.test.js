'use strict';

const assert = require('assert');
const expect = require('chai').expect;
const app = require('../../../src/app');

describe('message service', function() {
  it('registered the messages service', () => {
    assert.ok(app.service('messages'));
  });



  it('rejects invalid authToken', () => {
    return app.service('messages').create({
      title: 'New Notification',
      body: 'You have a new Notification',
      token: 'invalidToken',
      scopeIds: [
        'userIdOrScopeId',
        'testScopeId'
      ]
    })
    .then(res => {
      expect(res.code).to.be.above(399);
    })
    .catch(err => {
      expect(err.code).to.be.above(399);
    });
  });

  it('sends a message', () => {
    return app.service('messages').create({
      title: 'New Notification',
      body: 'You have a new Notification',
      token: 'servicetoken2',
      scopeIds: [
        'userIdOrScopeId',
        'testScopeId'
      ]
    })
      .then(res => {
        console.log(res);
        expect(res.code).not.to.be.above(299);
      })
      .catch(err => {
        expect(err.code).not.to.exist;
      });
  });

  it.only('sends and retrieve a message', () => {
    let id;
    return app.service('messages').create({
      title: 'New Notification',
      body: 'You have a new Notification',
      token: 'servicetoken2',
      scopeIds: [
        'userIdOrScopeId',
        'testScopeId'
      ]
    })
      .then(res => {
        id = res.data.id;
        //console.log('last id was', id, res);
        return app.service('messages').get(''+id);
      })
      .then(res=>{
        //console.log('second result', res);
        assert(res.data.id, id);
      });
  });

});
