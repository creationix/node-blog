// Load some libraries
var Haml = require('./vendor/haml'),
    Markdown = require('./vendor/markdown'),
    Less = require('./vendor/less'),
    md5 = require('./vendor/md5').md5,
    File = require('file'),
    Posix = require('posix');

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
      props[name] = value;
    }
    props.content = Markdown.encode(markdown);
    return props;
  },

  // Compiles
  haml: function (haml) {
    return Haml.compile(haml);
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

// combo library.  Allows to group several callbacks.
function Combo(callback) {
  this.callback = callback;
  this.items = 0;
  this.results = [];
}
Combo.prototype = {
  add: function () {
    var self = this;
    this.items++;
    return function () {
      self.check(self.items - 1, arguments);
    };
  },
  check: function (id, arguments) {
    this.results[id] = Array.prototype.slice.call(arguments);
    this.items--;
    if (this.items == 0) {
      this.callback.apply(this, this.results);
    }
  }
};

// Generic compare helper
function cmp(value1, value2) {
  return ((value1 == value2) ? 0 : ((value1 > value2) ? 1 : -1));
}

// Do a custom sort on an object
function object_sort(obj, callback) {
  var keys = Object.keys(obj);
  var newobj = {};
  keys.sort(function (first, second) {
    return callback(first, obj[first], second, obj[second]);
  });
  keys.forEach(function (key) {
    newobj[key] = obj[key];
  });
  return newobj;
}

function render(data, next) {
  var Helpers, haml;
  var group = new Combo(function() {
    next("Done!\n" + Array.prototype.map.call(arguments, function (args) {
      return args[0] + " - " + args[1];
    }).join("\n"))
  });

  function write_file(filename, content) {
    var cb = group.add();
    File.write(filename, content).addCallback(function () {
      cb(new Date(), "  Wrote " + content.length + " bytes to " + filename);
    })
  }

  Helpers = {
    github: function (name) {
      return "http://github.com/" + name;
    },
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
    },
    format_date: function (date, format) {
      var date = new Date(date),
          match, value;
      while (match = format.match(/(%[a-z])/i)) {
        switch (match[1]) {
          case "%d":
            value = date.getDate();
            break;
          case "%m":
            value = date.getMonth() + 1;
            break;
          case "%Y":
            value = date.getFullYear();
            break;
          case "%H":
            value = date.getHours();
            break;
          case "%M":
            value = date.getMinutes();
            break;
          case "%S":
            value = date.getSeconds();
            break;
          default:
            value = "";
            break;
        }
        format = format.replace(match[1], value);
      }
      return format;
    }
  };
  haml = Helpers.partial;

  // Sort authors by name
  data.authors = object_sort(data.authors, function (key1, value1, key2, value2) {
    return cmp(key1, key2);
  });

  // Sort articles by date
  data.articles = object_sort(data.articles, function (key1, value1, key2, value2) {
    return cmp(value1.date, value2.date);
  });

  // Generate a page for each author...
  loop(data.authors, function (name, props) {
    props.link = name.toLowerCase().replace(/ /g, "_") + ".html";
    write_file(PUBLIC_DIR + "/" + props.link, haml("layout", {
      title: "About " + name,
      content: haml("author", props)
    }));
  });

  // Generate a page for each article...
  loop(data.articles, function (name, props) {
    props.link = name + ".html";
    props.author = data.authors[props.author];
    write_file(PUBLIC_DIR + "/" + props.link, haml("layout", {
      title: props.title,
      content: haml("article", props)
    }));
  });

  // Generate a index page...
  write_file(PUBLIC_DIR + "/index.html", haml("layout", {
    title: "Index",
    content: haml("index", data)
  }));

  // Write the static files as is...
  loop(data.static, function (filename, content) {
    write_file(PUBLIC_DIR + "/" + filename, content.content || content);
  });

}

exports.build = function (next) {
  // Kick off the process
  main([
    ["articles", ARTICLE_DIR, /^(.*)\.(markdown)$/],
    ["authors", AUTHOR_DIR, /^(.*)\.(markdown)$/],
    ["templates", SKIN_DIR, /^(.*)\.(haml)$/],
    ["static", SKIN_DIR, /^(.*)\.([^.]+)\.([^.]+)$/]
  ], function (data) {
    render(data, next);
  });
};