# node-blog

node-blog is a static site generator.  It's built on node and is currently used to auto-generate the site <http://howtonode.org/>

The source code for the site is at <http://github.com/creationix/howtonode.org>

Here is part of the nginx config for howtonode.org:

    server {
      listen   80;
      server_name howtonode.org;
      root   /home/tim/www/howtonode.org/public;
      index index.html;
      location / {
        if (-f $request_filename.html) {
          rewrite (.*) $1.html break;
        }
      }
      location /post_hook {
        proxy_pass http://127.0.0.1:4242;
      }
    }
