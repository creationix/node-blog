require.paths.unshift(__dirname);
var QueryString = require('querystring'),
    Http = require('http'),
    Build = require('./build');
process.mixin(require('sys'));
var PORT = 4242;

function log(message) {
  puts((new Date()) + " - " + message);
}

Http.createServer(function (req, res) {
  var body = "";
  req.setBodyEncoding('utf8');
  req.addListener('data', function (chunk) {
    body += chunk;
  });
  req.addListener('end', function () {
    if (body.length > 0) {
      log("Received GitHub POST hook: " + body);
    } else {
      body = false;
      log("Manual refresh");
    }
    build(body, function (output) {
      res.sendHeader(200, {'Content-Type': 'text/plain'});
      res.write(output);
      res.close();
    });
  });

}).listen(PORT);

// simple semaphore
var building = false;

function build(data, next) {

  function real_build() {
    if (building) {
      return;
    }
    building = true;

    log("Rebuilding site");
    Build.build(function (output) {
      log(output);
      building = false;
      next(output);
    }, log);
  }

  if (data) {
    log("Pulling latest changes to content");
    exec("cd " + __dirname + "/data && git pull origin master").addCallback(function (stdout, stderr) {
      real_build();
    });
  } else {
    real_build();
  }
}
build(null, function(output) {
  log("Initial build done. Waiting for more requests");
  log('Server running at http://127.0.0.1:' + PORT + '/');
});
