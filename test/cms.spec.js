'use strict';

var sprintf = require('sprintf-js').sprintf;
var sinon = require('sinon');
var request = require('request');
var fs = require('fs');

var Cms = require('../lib/cms');

var settingsFixture = require('./fixtures/cms.settings.json');
//var settingsFixture = require('../coverage/cms.settings.json'); // TEMP Integration settings
var responseFixture = require('./fixtures/cms.responses.json');
var responseExportCSV;
fs.readFile(__dirname + '/fixtures/cms.responses.export.csv', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
  responseExportCSV = data;
});

describe('cms module', function(){

  var mock = settingsFixture.mock;
  var serviceUrl = settingsFixture.serviceUrl;
  var namespace = settingsFixture.namespace;
  var username = settingsFixture.username;
  var password = settingsFixture.password;

  beforeEach(function(){
    this.cms = new Cms(serviceUrl, namespace, username, password);
    if (mock) {
      this.get = sinon.stub(request, 'get');
    }
  });

  afterEach(function(){
    if (mock) {
      request.get.restore();
    }
  });

  describe('buildCredentialsXmlData()', function(){

    it('should be able to build xmlData for credentials', function(){
      var xmlData = '<credentials><credentialElements><name>CAMNamespace</name><value><actualValue>%s</actualValue></value></credentialElements><credentialElements><name>CAMUsername</name><value><actualValue>%s</actualValue></value></credentialElements><credentialElements><name>CAMPassword</name><value><actualValue>%s</actualValue></value></credentialElements></credentials>';
      xmlData = sprintf(xmlData, namespace, username, password);

      var credentials = this.cms.buildCredentialsXmlData(namespace, username, password);
      assert.equal(xmlData, credentials);
    });

  });

  describe('url()', function(){

    it('should be able to build url', function(){
      var url = this.cms.url('resourceType', 'sourceType', 'sourceId');
      assert.equal('/rds/resourceType/sourceType/sourceId', url);
    });

    it('should be able to build url without sourceId', function(){
      var url = this.cms.url('resourceType', 'sourceType');
      assert.equal('/rds/resourceType/sourceType', url);
    });

  });

  describe('logon()', function(){

    it('should be able to login', function(done){

      if (mock) {
        var response = { statusCode:200, body:responseFixture.logon };
        this.get.callsArgWith(2, null, response);
      }

      this.cms.logon().then(function(res){
        assert.equal(200, res.statusCode);
        assert.isObject(res.bodyJson, 'response contains bodyJson');
        assert.match(res.bodyJson.accountID, /^CAMID\(/);
        assert.equal('Nesbert Hidalgo', res.bodyJson.displayName);
        done();
      }).catch(done);

    });

    if (mock) {
      it('should fail login', function (done) {

        var response = { statusCode:403, body:'<ERROR>' };
        this.get.callsArgWith(2, response);

        this.cms.logon().then(function () {
          assert.fail('should have failed!');
        }).catch(function (e) {
          assert.ok(e, 'everything is ok');
          done();
        });

      });

      it('should fail login with bad response', function (done) {

        var response = { statusCode:200, body:'bad response' };
        this.get.callsArgWith(2, null, response);

        this.cms.logon().then(function () {
          assert.fail('should have failed!');
        }).catch(function (e) {
          assert.ok(e, 'everything is ok');
          done();
        });

      });
    }

    it('should fail login (bad password)', function(done){

      this.cms.password = 'BADPASS';

      if (mock) {
        var response = { statusCode:200, body:responseFixture.logonFail };
        this.get.callsArgWith(2, null, response);
      }

      this.cms.logon().then(function(res){
        assert.equal(200, res.statusCode);
        assert.isUndefined(res.bodyJson.accountID);
        assert.isUndefined(res.bodyJson.displayName);
        assert.match(res.body, /^<error/);
        done();
      }).catch(done);

    });

  });

  describe('logoff()', function(){

    before(function(done){
      if (!mock) {
        this.cms.logon().then(function () {
          done();
        }).catch(done);
      } else {
        done();
      }
    });

    it('should be able to logoff', function(done){

      if (mock) {
        var response = { statusCode:200, body:responseFixture.logoff };
        this.get.callsArgWith(2, null, response);
      }

      this.cms.logoff().then(function(res){
        assert.equal(200, res.statusCode);
        assert.equal('<noerror/>', res.body, 'response contains <noerror/>');
        done();
      }).catch(done);

    });

    if (mock) {
      it('should fail logoff', function (done) {

        var response = {statusCode: 403, body: '<ERROR>'};
        this.get.callsArgWith(2, response);

        this.cms.logoff().then(function () {
          assert.fail('should have failed!');
        }).catch(function (e) {
          assert.ok(e, 'everything is ok');
          done();
        });

      });
    }

  });

  describe('getReportById()', function(){

    before(function(done){
      if (!mock) {
        this.cms.logon().then(function () {
          done();
        }).catch(done);
      } else {
        done();
      }
    });

    it('should be able to run a report', function(done){

      if (mock) {
        var response = { statusCode:200, body:responseFixture.getReportById };
        this.get.callsArgWith(2, null, response);
      } else {
        this.timeout(5000);
      }

      this.cms.getReportById(settingsFixture.reportId, settingsFixture.reportParams).then(function(res){
        assert.equal(200, res.statusCode);
        assert.isString(res.body, 'body is a string');
        assert.match(res.body, /^<div/);
        done();
      }).catch(done);

    });

    if (mock) {
      it('should fail logoff', function (done) {

        var response = {statusCode: 403, body: '<ERROR>'};
        this.get.callsArgWith(2, response);

        this.cms.getReportById(settingsFixture.reportId, settingsFixture.reportParams).then(function () {
          assert.fail('should have failed!');
        }).catch(function (e) {
          assert.ok(e, 'everything is ok');
          done();
        });

      });
    }

  });

  describe('getExportById()', function(){

    before(function(done){
      if (!mock) {
        this.cms.logon().then(function () {
          done();
        }).catch(done);
      } else {
        done();
      }
    });

    it('should be able to export a report', function(done){

      if (mock) {
        var response = { statusCode:200, body:responseExportCSV };
        this.get.callsArgWith(2, null, response);
      } else {
        this.timeout(5000);
      }

      this.cms.getExportById(settingsFixture.reportId, settingsFixture.reportParams, 'CSV').then(function(res){
        assert.equal(200, res.statusCode);
        assert.isString(res.body, 'body is a string');

        assert.match(res.body, /\t/); // has tab
        assert.match(res.body, /\n/); // has newline

        done();
      }).catch(done);

    });

    if (mock) {
      it('should fail logoff', function (done) {

        var response = {statusCode: 403, body: '<ERROR>'};
        this.get.callsArgWith(2, response);

        this.cms.getExportById(settingsFixture.reportId, settingsFixture.reportParams, 'CSV').then(function () {
          assert.fail('should have failed!');
        }).catch(function (e) {
          assert.ok(e, 'everything is ok');
          done();
        });

      });
    }

  });

});