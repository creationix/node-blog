var Markdown = require('markdown'),
    Url = require('url'),
    Http = require('http');
process.mixin(require('sys'));

Http.createServer(function (req, res) {
  var body = "";
  req.setBodyEncoding('utf8');
  req.addListener('body', function (chunk) {
    body += chunk;
  });
  req.addListener('complete', function () {
    try {
      body = Url.parse("?" + body, true).query.payload;
      p(body);    
      body = JSON.parse(body);
      p(body);
      res.sendHeader(200, {'Content-Type': 'text/plain'});
      res.sendBody('Thanks for the tip!');
      res.finish();
    } catch(e) {
      res.sendHeader(500, {'Content-Type': 'text/plain'});
      res.sendBody('Problem reading post message!');
      res.finish();
    }
  });

}).listen(4242);
puts('Server running at http://127.0.0.1:4242/');
