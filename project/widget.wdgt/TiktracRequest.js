var TiktracRequest = Class.create({
    initialize: function()
    {
        this.refreshCredentials()
        this.loginCredentials = this.encode64(this.email + ':' + this.password)
    },
    
    refreshCredentials: function()
    {
        this.url = this.formatURL(widget.preferenceForKey("userAccountName"))
        this.email = widget.preferenceForKey("userEmail")
        this.password = widget.preferenceForKey("userPass")
    },

    /* Check if the login credentials are valid */
    valid: function(onSuccess, onFailure)
    {
        if (typeof(this.url) == 'undefined' || this.url.length == 0) return onFailure()
        this.send('sheets', null, { 'method': 'get', 'on200': onSuccess, 'onFailure': onFailure })
    },

    send: function(url, callback)
    {
		var url = this.url + this.prepareURL(url)
		var options = Object.extend({
            method:	'get',
            contentType: 'application/xml',
            requestHeaders: [
                'Cache-Control', 'no-cache',
                'Pragma', 'no-cache',
                'Accept', 'application/xml',
                'Authorization', "Basic " + this.loginCredentials,
                'Content-type', 'application/xml'
            ],
			onSuccess: callback
		}, arguments[2] || {})
        new Ajax.Request(url, options) // This bit adds any extra arguments like XML updates
    },

    prepareURL: function(url)
    {
        this.refreshCredentials();
        var date = (new  Date).getTime()
        var url = url.match(/\?/) ? url + '&cache_date=' + date : url + '?cache_date=' + date
        return url
    },

    encode64: function(input)
    {
        // This code was written by Tyler Akins and has been placed in the
        // public domain.  It would be nice if you left this header intact.
        // Base64 code from Tyler Akins -- http://rumkin.com

        var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
        var output = ""
        var chr1, chr2, chr3
        var enc1, enc2, enc3, enc4
        var i = 0

        do {
            chr1 = input.charCodeAt(i++)
            chr2 = input.charCodeAt(i++)
            chr3 = input.charCodeAt(i++)

            enc1 = chr1 >> 2
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4)
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6)
            enc4 = chr3 & 63

            if (isNaN(chr2)) {
                enc3 = enc4 = 64
            } else if (isNaN(chr3)) {
                enc4 = 64
            }

            output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + 
            keyStr.charAt(enc3) + keyStr.charAt(enc4)
        } while (i < input.length)

        return output
    },

    formatURL: function(url)
    {
        if (typeof(url) == 'undefined') return
        
        return url.match(/^http/) ? (url + '/').replace(/\/+$/, '/') : 'http://#{url}.tiktrac.com/'.interpolate({url: url})	
    }
})