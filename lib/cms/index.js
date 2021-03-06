'use strict';

// TODO prompt helpers (dynamic forms)
// logger

var _ = require('lodash');
var xml2js = require('xml2js');
var request = require('request');
var Q = require('q');
var credentialsJson = require('./credentials.json');

var defaults = {
  jar: true, // enable cookies for requests
  gzip: true,
  maxRedirects: 10
};

// Wrapper module to facilitates the communication to Cognos Mashup
// Service ([CMS](http://www.ibm.com/developerworks/data/library/techarticle/dm-1001cognosmashup/index.html)).
// Utilize promises from all requests to CMS.

// Helper function to find credentialElement by name.
function getCAMNode(credentialElements, name) {
  return _.findWhere(credentialElements, { name: name });
}

// Helper function to format auth ns tag name.
function formatAuthTagName(name) {
  return name.replace('auth:', '');
}

// Helper to create promise.
function getPromise(url, ops) {
  // <3 promises
  var d = Q.defer();

  // Refer ATL-549
  require('events').EventEmitter.prototype._maxListeners = ops.maxRedirects;

  request.get(url, ops, function(error, response) {
    if (error) {
      d.reject(error);
      return;
    }

    if(ops.qs && ops.qs.fmt === 'CSV' && _.isString(response.body)){
      // Replace Invalid characters with null
      response.body = response.body.replace(/\uFFFD/g, '\u0000');
    }

    d.resolve(response);
  });

  return d.promise;
}

// Cms
// --------------

function Cms(serviceUrl, namespace, username, password) {

  this.serviceUrl = serviceUrl;
  this.namespace = namespace;
  this.username = username;
  this.password = password;
}

// expose default object
Cms.prototype.defaults = defaults;

// Build XML string for used in login request.
Cms.prototype.buildCredentialsXmlData = function(namespace, username, password) {
  // TODO check for params

  // clean up/format xml for cognos
  var builderOptions = {headless:true, renderOpts: {pretty:false}};
  var builder = new xml2js.Builder(builderOptions);

  // json to xml ftw!
  var data = credentialsJson;
  var credentialElements = data.credentials.credentialElements;

  // inject params
  var ns = getCAMNode(credentialElements, 'CAMNamespace');
  ns.value.actualValue = namespace;
  var u = getCAMNode(credentialElements, 'CAMUsername');
  u.value.actualValue = username;
  var p = getCAMNode(credentialElements, 'CAMPassword');
  p.value.actualValue = password;

  // return xml string
  return builder.buildObject(data);
};

// Create params object for all requests to CMS.
Cms.prototype.params = function(qs) {
  var ops = {
    baseUrl: this.serviceUrl,
    qs: qs
  };

  return _.extend(ops, defaults);
};

// Create URL string for all requests to CMS.
Cms.prototype.url = function(resourceType, sourceType, sourceId) {
  var parts = ['', 'rds', resourceType, sourceType];
  // append sourceId when needed
  if (sourceId) {
    parts.push(sourceId);
  }
  return parts.join('/');
};

// Create login session, subsequent calls will utilize the same authenticated session.
// CMS REST services utilize session management via cookies that are set during the login process.
// We are leveraging the cookie jar container with the request module to simulate this behavior.
Cms.prototype.logon = function() {
  var xmlData = this.buildCredentialsXmlData(this.namespace, this.username, this.password);
  var ops = this.params({ xmlData: xmlData });
  var url = this.url('auth', 'logon');
  var self = this;

  var d = Q.defer();

  request.get(url, ops, function(error, response) {
    if (error) {
      d.reject(error);
      return;
    }

    // transform response to json
    var parser = new xml2js.Parser({
      tagNameProcessors: [formatAuthTagName]
    });
    parser.parseString(response.body, function(error, result) {
      if (error) {
        d.reject(error);
        return;
      }

      if (result == null) { result = {}; }
      var accountInfo = result.accountInfo || {};
      response.bodyJson = self.auth = {};
      response.bodyJson.accountID = _.first(accountInfo.accountID || null);
      response.bodyJson.displayName = _.first(accountInfo.displayName || null);
      d.resolve(response);
    });
  });


  return d.promise;
};

// Expire current session.
Cms.prototype.logoff = function() {
  var ops = this.params();
  var url = this.url('auth', 'logoff');

  return getPromise(url, ops);
};

// Get the list of reports in a folderPath. Helper method for
// `/rds/wsil/path/{folderPath}` and query params.
Cms.prototype.getReports = function(folderPath) {
  var ops = this.params();
  var url = this.url('wsil', 'path', folderPath);
  return getPromise(url, ops);
};

// Get a report by source_id and parameters. Helper method for
// `/rds/reportData/report/{sourceId}` and query params.
Cms.prototype.getReportById = function(sourceId, qs) {
  var ops = this.params(qs);
  var url = this.url('reportData', 'report', sourceId);

  return getPromise(url, ops);
};

// Get an export by source_id, parameters and outputFormat. Helper method for
// `/rds/outputFormat/report/{sourceId}/{outputFormat}` and query params.
Cms.prototype.getExportById = function(sourceId, qs, outputFormat) {
  var ops = this.params(qs);
  var url = this.url('outputFormat', 'report', sourceId) + '/' + outputFormat;

  // When spreadsheetML is chosen, the report returned is encoded in base64 scheme.
  if(outputFormat === 'spreadsheetML'){
    ops.encoding = 'base64';
  }

  return getPromise(url, ops);
};

// NOTE: Compatible with Cognos REST API v10.2.2.
// This will be deprecated in an future version of Cognos REST API.
// Get the descriptions of the prompts for a report in XML - RDS Schema.
// Helper method for `/rds/promptDescription/report/{sourceId}` and query params.
Cms.prototype.getPromptDescriptionById = function(sourceId, qs) {
  var ops = this.params(qs);
  var url = this.url('promptDescription', 'report', sourceId);

  return getPromise(url, ops);
};

// Exports

module.exports = Cms;
