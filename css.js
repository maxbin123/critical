const express = require('express');
const app = express();
const penthouse = require('penthouse');
const CssMinifier = require('clean-css');
const validUrl = require('valid-url');
const urlResolver = require('url');
const {URL} = require('url');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

let options = {};

app.get('/', function (req, res) {
    if (!validUrl.isUri(req.query.url)) {
        res.status(400).send('Not valid URL!');
        return;
    }
    let url = req.query.url;
    console.log('Request URL: ' + url);
    options = {
        'timeout': 30000,
        'width': req.query.width ,
        'height': req.query.height,
        'userAgent': req.query.ua,
        'debug': true,
    }
    readCssSources(url, options)
        .then(rawcontents => new CssMinifier({restructuring: false}).minify(rawcontents).styles)
        .then(csscontents => processCss(url, csscontents, options))
        .then(criticalCss => new CssMinifier().minify(criticalCss).styles)
        .then(criticalCss => res.send(criticalCss))
        .catch(function (e) {
            console.log(e);
            throw e
        });
});

function getText(url, options, rewrite = false) {
    return fetch(url, {
            headers: {
                'User-agent': options.userAgent
            },
        })
        .then(res => res.text())
        .then(function (res) {
            if (rewrite) {
                return rewriteUrls(res, url);
            }
            return res;
        })
}

function rewriteUrls(css, url) {
    myUrl = new URL(url);
    var pathname = myUrl.pathname.split("/").slice(0, -1).join("/")
    var regex = /url(?:\(['"]?)(.*?)(?:['"]?\))/g;
    css = css.replace(regex, function (match, p1) {
        if (validUrl.isWebUri(p1) || p1.substr(0, 2) == '//') {
            return match;
        } else {
            if (validUrl.isWebUri(myUrl.origin + pathname + '/' + p1)) {
                return 'url(' + pathname + '/' + p1 + ')';
            } else {
                return match;
            }
        }
    })
    return css;
}

function readCssSources(url, options) {
    var parsedUrl = url.split('?')[0];
    var log = (isTrue(options.debug) || isTrue(process.env.DEBUG)) ? console.log.bind(console) : () => {}
    return getText(url + '?nomini=1', options).then(function (html) {
        var $ = cheerio.load(html);
        var cssStringPromises = [];
        var hrefs = {};
        $('link[rel=stylesheet], style').map(function (i, el) {
            var $el = $(this);
            if ($el.attr('href')) {
                var res = $el.attr('href');
                var linkHref = urlResolver.resolve(url, res);
                if (!hrefs[linkHref]) {
                    log('Found Link: ' + linkHref)
                    hrefs[linkHref] = true;
                    cssStringPromises.push(getText(linkHref, options, true), options);
                }
            } else if ($el.text()) {
                log('Found Style Element: ' + $el.attr('id'))
                cssStringPromises.push(Promise.resolve($el.text()));
            }
        });
        return Promise.all(cssStringPromises).then(cssStrings => cssStrings.join(''));
    });
}

function processCss(url, csscontents, options) {
    var log = (isTrue(options.debug) || isTrue(process.env.DEBUG)) ? console.log.bind(console) : () => {}
    penthouse.DEBUG = isTrue(options.debug) || isTrue(process.env.DEBUG)
    var options = options || {};
    return new Promise(function (resolve, reject) {
        log('Start Processing');
        penthouse({
            url: url,
            cssString: csscontents,
            renderWaitTime: 400,
            timeout: asNumber(options.timeout),
            width: asNumber(options.width),
            height: asNumber(options.height),
            userAgent: strValue(options.userAgent),
            strict: false,
        }, function (err, criticalCss) {
            if (err) {
                log('error:' + err)
                // handle error
                reject(err);
            }
            log('End Processing');
            resolve(criticalCss);
        });
    })
}

function isTrue(exp) {
    return !!exp && (('' + exp).toLowerCase() == 'true');
}

function booleanValue(exp, defaultValue) {
    if (typeof exp === 'undefined') {
        return defaultValue;
    } else {
        if (!exp || (('' + exp).toLowerCase() == 'false')) {
            return false;
        } else if ((('' + exp).toLowerCase() == 'true')) {
            return true;
        }
        return defaultValue;
    }
}

function strValue(exp) {
    if (!exp || exp === 'undefined' || exp === 'null') {
        return undefined
    }
    try {
        return JSON.parse(exp)
    } catch (err) {
        return exp;
    }
}

function asNumber(exp, defaultValue) {
    return exp ? parseInt(exp) : defaultValue;
}

app.listen(8081, () => {
    console.log('We are live on ' + 8081);
});
