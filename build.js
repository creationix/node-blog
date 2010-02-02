// Define puts and friends
process.mixin(require('sys'));

// Load some libraries
var Haml = require('haml'),
    Markdown = require('markdown'),
    Less = require('less'),
    File = require('file'),
    Posix = require('posix'),
    md5 = require('md5').md5;

var ARTICLE_DIR = 'data/articles',
    AUTHOR_DIR = 'data/authors',
    SKIN_DIR = 'data/skin',
    PUBLIC_DIR = 'public';

var articles = [],
    authors = {};

var Filters = {

  // Extends markdown by allowing properties at the top.
  markdown: function (markdown) {
    var match;
    var props = {};
    while(match = markdown.match(/^([a-z]+):\s*(.*)\s*\n/i)) {
      var name = match[1].toLowerCase(),
          value = match[2];
      markdown = markdown.substr(match[0].length);
      if (value.match(/\d+-\d+-\d+/)) {
        value = value.split('-');
        value = new Date(value[0], value[1], value[2]);
      }
      props[name] = value;
    }
    props.content = Markdown.encode(markdown);
    return props;
  },

  // Compiles
  haml: function (haml) {
    return Haml.optimize(Haml.compile(haml));
  },

  less: function (less) {
    return Less.compile(less);
  },

  // Catchall
  method_missing: function (format, text) {
    return {
      format: format,
      content: text
    }
  }
}

// Processes a folder of data.
function process_folder(folder, filter, next) {
  var items = {};
  Posix.readdir(folder).addCallback(function (names) {
    var left = 0;
    if (names.length === 0) {
      next(items);
    }
    names.forEach(function (filename) {
      var match = filename.match(filter),
          format, name;
      if (!match) {
        return;
      }
      name = match[1];
      if (match[3]) {
        format = match[3];
        name = name + "." + match[2]
      } else {
        format = match[2];
      }
      left++;
      File.read(folder + "/" + filename).addCallback(function (text) {
        if (Filters[format]) {
          items[name] = Filters[format](text);
          items[name].name = name;
        } else {
          items[name] = Filters.method_missing(format, text);
        }
        left--;
        if (left <= 0) {
          next(items);
        }
      });
    });
  });
}

function main(folders, next) {
  var left = 0,
      data = {};
  folders.forEach(function (triple) {
    left++;
    process_folder(triple[1], triple[2], function(items) {
      data[triple[0]] = items;
      left--;
      if (left <= 0) {
        next(data);
      }
    });
  });
}

// Simple loop over objects.
function loop(obj, callback) {
  var key, value;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      callback(key, obj[key]);
    }
  }
}

function render(data) {
  var Helpers, haml;
  Helpers = {
    gravitar: function (email, size) {
      size = size || 80
      return "http://www.gravatar.com/avatar/" +
        md5(email.trim().toLowerCase()) +
        "?r=pg&s=" + size + ".jpg";
    },
    partial: function (name, props) {
      var locals = Object.create(Helpers);
      process.mixin(locals, props);
      return Haml.execute(data.templates[name], {}, locals);
    }
  };
  haml = Helpers.partial;

  // Write the static files as is...
  loop(data.static, function (filename, content) {
    File.write(PUBLIC_DIR + "/" + filename, content);
  });

  // Generate a page for each article...
  loop(data.articles, function (name, props) {
    File.write(PUBLIC_DIR + "/" + name + ".html", haml("layout", {
      title: props.title,
      content: haml("article", props)
    }));
  });

  // Generate a page for each author...
  loop(data.authors, function (name, props) {
    var filename = name.toLowerCase().replace(/ /g, "_") + ".html";
    File.write(PUBLIC_DIR + "/" + filename, haml("layout", {
      title: "About " + name,
      content: haml("author", props)
    }));
  });

  // Generate a index page...
  File.write(PUBLIC_DIR + "/index.html", haml("layout", {
    title: "Index",
    content: haml("index", data)
  }));
}

// Kick off the process
main([
  ["articles", ARTICLE_DIR, /^(.*)\.(markdown)$/],
  ["authors", AUTHOR_DIR, /^(.*)\.(markdown)$/],
  ["templates", SKIN_DIR, /^(.*)\.(haml)$/],
  ["static", SKIN_DIR, /^(.*)\.([^.]+)\.([^.]+)$/]
], render);
