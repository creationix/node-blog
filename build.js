// Load some libraries
require.paths.unshift(__dirname + "/vendor");
var Haml = require('haml'),
    Markdown = require('markdown'),
    md5 = require('md5').md5,
    Do = require('do'),
    fs = Do.convert(require('fs'), ['readdir', 'stat', 'readFile', 'writeFile']),
    sys = Do.convert(require('sys'), ['exec']);

var ARTICLE_DIR = __dirname + '/data/articles',
    AUTHOR_DIR = __dirname + '/data/authors',
    SKIN_DIR = __dirname + '/data/skin',
    PUBLIC_DIR = __dirname + '/public';

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

  // Catchall
  method_missing: function (format, text) {
    // return text;
    return {
      format: format,
      content: text
    }
  }
}

// Load all files in a directory and pre-process them based on extension.
function process_folder(path) { return function (callback, errback) {
  fs.readdir(path)(function (filepaths) {
    filepaths = filepaths.map(function (filepath) { return path + "/" + filepath; });
    Do.filter_map(filepaths, function (filepath, callback, errback) {
      fs.stat(filepath)(function (stat) {
        if (!stat.isFile()) { callback(); return ; }
        fs.readFile(filepath)(function (data) {
          callback([filepath, data]);
        }, errback);
      }, errback);
    })(function (pairs) {
      callback(pairs.reduce(function (obj, el) {
        var ext = el[0].match(/[^.]*$/)[0];
        var val = Filters[ext] ? Filters[ext](el[1]) : Filters.method_missing(ext, el[1]);
        var name = el[0].match(/([^/]*)\.[^\/]*$/)[1];
        if (typeof val === 'object') {
          val.name = name;
        }
        obj[name] = val;
        return obj;
      }, {}));
    }, errback);
  }, errback);
}}

// combo library.  Allows to group several callbacks.
function Combo(callback) {
  this.callback = callback;
  this.items = 0;
  this.results = [];
}
Combo.prototype = {
  add: function () {
    var self = this,
        id = this.items;
    this.items++;
    return function () {
      self.check(id, arguments);
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


// Simple loop over objects.
function loop(obj, callback) {
  var key, value;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      callback(key, obj[key]);
    }
  }
}

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

exports.build = function (next, error_handler) {
  // Load up the data files
  Do.parallel(
    process_folder(AUTHOR_DIR),
    process_folder(ARTICLE_DIR),
    process_folder(SKIN_DIR)
  )(function (authors, articles, templates) {
    var group = new Combo(function() {
      next("Done!\n" + Array.prototype.map.call(arguments, function (args) {
        return args[0] + " - " + args[1];
      }).join("\n"))
    });

    function write_file(filename, content) {
      var cb = group.add();
      fs.writeFile(filename, content)(function () {
        cb(new Date(), "  Wrote " + content.length + " bytes to " + filename);
      }, error_handler);
    }

    var Helpers = {
      github: function (name) {
        return "http://github.com/" + name;
      },
      gravitar: function (email, size) {
        size = size || 80
        return "http://www.gravatar.com/avatar/" +
          md5(email.trim().toLowerCase()) +
          "?r=pg&s=" + size + ".jpg&d=identicon";
      },
      partial: function (name, props) {
        var locals = Object.create(Helpers);
        process.mixin(locals, props);
        return Haml.execute(templates[name], {}, locals);
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
    var haml = Helpers.partial;
  
    // Sort authors by name
    authors = object_sort(authors, function (key1, value1, key2, value2) {
      return cmp(key1, key2);
    });

    // Sort articles by date, newest first
    articles = object_sort(articles, function (key1, value1, key2, value2) {
      return cmp(Date.parse(value2.date), Date.parse(value1.date));
    });
    
    var data = {
      authors: authors,
      articles: articles
    };

    // Generate a page for each author...
    loop(authors, function (name, props) {
      props.link = name.toLowerCase().replace(/ /g, "_");
      write_file(PUBLIC_DIR + "/" + props.link + ".html", haml("layout", {
        title: "About " + name,
        content: haml("author", props)
      }));
    });

    // Generate a page for each article...
    loop(articles, function (name, props) {
      props.link = name;
      props.author = authors[props.author];
      write_file(PUBLIC_DIR + "/" + props.link + ".html", haml("layout", {
        title: props.title,
        content: haml("article", props)
      }));
    });

    // Generate a index page...
    write_file(PUBLIC_DIR + "/index.html", haml("layout", {
      title: "Index",
      content: haml("index", data)
    }));

    // Make the RSS Feed...
    write_file(PUBLIC_DIR + "/feed.xml", haml("feed", data).replace(/(&lt;code&gt;)\#\![a-z]+\n/g, "$1"));
  
    // Copy the static files...
    sys.exec("cp -r " + SKIN_DIR + "/public/* " + PUBLIC_DIR + "/")(group.add(), error_handler);
  });
}

// exports.build(puts, debug);

