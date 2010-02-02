var Markdown = require('markdown'),
    Url = require('url'),
    Http = require('http'),
    Build = require('./build');
process.mixin(require('sys'));
var PORT = 4242;

Http.createServer(function (req, res) {
  var body = "";
  req.setBodyEncoding('utf8');
  req.addListener('body', function (chunk) {
    body += chunk;
  });
  req.addListener('complete', function () {
    try {
      body = Url.parse("?" + body, true).query.payload;
      body = JSON.parse(body);
    } catch(e) {
      body = false;
    }
    build(body);
    res.sendHeader(200, {'Content-Type': 'text/plain'});
    res.sendBody('Thanks for the tip!');
    res.finish();
  });

}).listen(PORT);

function build(pull) {
  if (pull) {
    exec("cd data && git pull origin master").addCallback(function (stdout, stderr) {
      puts(stdout);
      Build.build();
    });
  } else {
    Build.build();
  }
}
puts('Server running at http://127.0.0.1:' + PORT + '/');
