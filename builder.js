var Markdown = require('markdown'),
    Url = require('url'),
    Http = require('http'),
    Build = require('./build');
process.mixin(require('sys'));

Http.createServer(function (req, res) {
  var body = "";
  req.setBodyEncoding('utf8');
  req.addListener('body', function (chunk) {
    body += chunk;
  });
  req.addListener('complete', function () {
    // try {
    //   puts(body);
    //   body = Url.parse("?" + body, true).query.payload;
    //   puts(body);
    //   body = JSON.parse(body);
    // } catch(e) {
    //   res.sendHeader(500, {'Content-Type': 'text/plain'});
    //   res.sendBody('Problem reading post message!\n' + e.stack);
    //
    //   res.finish();
    //   return;
    // }
    try {
      build(body);
      res.sendHeader(200, {'Content-Type': 'text/plain'});
      res.sendBody('Thanks for the tip!');
      res.finish();
    } catch(e) {
      res.sendHeader(500, {'Content-Type': 'text/plain'});
      res.sendBody(e.stack);
      res.finish();
    }
  });

}).listen(4242);

function build(data) {
  p(data);
  exec("cd data && git pull origin master").addCallback(function (stdout, stderr) {
    puts(stdout);
    Build.build();
  });
}
puts('Server running at http://127.0.0.1:4242/');
