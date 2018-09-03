/**
	Copyright (c) 2008- Samuli Järvelä

	All rights reserved. This program and the accompanying materials
	are made available under the terms of the Eclipse Public License v1.0
	which accompanies this distribution, and is available at
	http://www.eclipse.org/legal/epl-v10.html. If redistributing this code,
	this entire header must remain intact.
*/

(function(){
window.mollify = new function() {
	this.admin = new function() {
		var t = this;
		
		this.settings = {
			"date-format" : "mm/dd/yy",
			"datetime-format" : "mm/dd/yy hh.MM t"
		}
		
		this.init = function(s) {
			if (!s) return;
			for (var k in s) t.settings[k] = s[k];
		}
	}
}
})();

var session = null;
var loadedScripts = [];
var controller = null;
var controllers = {};
var plugins = {};

var views = [
	{header:"System", id:'menu-header-system', views: [
		{title:"Published Folders", id: "menu-published-folders", "class": "MollifyPublishedFoldersConfigurationView", "script" : "folders/published_folders.js", "title": "Published Folders"},
		{title:"Users", id:'menu-users', "class" : "MollifyUsersConfigurationView", "script" : "users/users.js", "title": "Users"},
		{title:"User Groups", id:'menu-usergroups', "class" : "MollifyUserGroupsConfigurationView", "script" : "users/groups.js", "title": "Groups"}
	]}
];

$(document).ready(function() {
	preRequestCallback = function() { $("#request-indicator").addClass("active"); };
	postRequestCallback = function() { $("#request-indicator").removeClass("active"); }
	$.datepicker.setDefaults( { dateFormat: getDateFormat() } );
	
	$("#admin-logout").click(function() {
		doLogout(onLogout, onServerError);
	});
	
	getSessionInfo(onSession, onServerError);
});

function onLogout() {
	window.location = window.location;
}

function buildMenu() {
	var html = '<ul>';
	
	// built-in views
	html += createMenuItems(views, '');
	
	//plugin views
	for (id in plugins) {
		var p = plugins[id];
		if (!p.views) continue;
		html += createMenuItems(p.views, "../plugin/"+id+"/admin/");
	}
	
	// custom views
	if (getSettings().views) {
		var customViews = [{header:"Custom", id:'menu-header-custom', views: getSettings().views}];
		html += createMenuItems(customViews, 'custom/');
	}
	
	html += '</ul>';
	$("#main-menu").html(html);
	
	$(".main-menu-item").click(function() {
		$(".main-menu-item").removeClass("active");
		$(this).addClass("active");
		onSelectMenu($(this).attr("id"));
	});
	
	$("#content").show();
	
	showVersion();
}

function createMenuItems(views, pathPrefix) {
	var html = '';
	
	for (var i=0; i < views.length; i++) {
		var h = views[i];
		var t = '';
		var found = false;
		
		for (var j=0; j < h.views.length; j++) {
			var v = h.views[j];
			var featureRequired = v.feature;
			if (featureRequired) {
				var s = getSession();
				if (!s.features[featureRequired]) continue;
			}
			
			found = true;
			t += '<li id="' + v.id + '" class="main-menu-item">' + v.title + '</li>';
			
			v["path_prefix"] = pathPrefix;
			controllers[v.id] = v;
		}
		
		if (found)
			html += '<li id="' + h.id + '" class="main-menu-header">' + h.header + '</li>' + t;
	}
	return html;
}

function onSession(session) {
	if (!session["authentication_required"] || !session["authenticated"] || session["default_permission"] != 'A') {
		onUnauthorized();
		return;
	}
	if (!session.features["administration"]) {
		$("body").html("Current configuration type is not supported by the Mollify administration utility. For more information, see <a href='http://code.google.com/p/mollify/wiki/Installation'>Installation instructions</a>");
		return;
	}
	this.session = session;

	var pluginsToInit = [];
	for (id in session.plugins) {
		var plugin = session.plugins[id];
		if (!plugin["admin"]) continue;
		pluginsToInit.push(id);
	}
	
	if (pluginsToInit.length == 0) buildMenu();
	else loadPlugin(pluginsToInit, 0);
}

function showVersion() {
	$("#mollify-version").html("Version "+session.version);
	if (getSettings()["disable-version-check"] === true) return;
	
	$.getJSON("http://www.mollify.org/latest.php?jsoncallback=?", function(result) {
		if (!result || !result.version) return;
		if (result.version != session.version) {
			$("#mollify-update-info").html("<h1>Update available!</h1><p><span class='title'>Latest version:</span>&nbsp;"+result.version+"<br/><span class='title'>Release date:</span>&nbsp;"+result.date+"</p><p><a id='update-download-link' href='http://www.mollify.org/download.php' class='update-link' target='_new'>Download</a>&nbsp;<a id='update-changelog-link' class='update-link' href='http://code.google.com/p/mollify/wiki/ChangeLog' target='_new'>Change log</a></p>");
			$("#mollify-version").tooltip({ effect: "slide", position: "bottom"});
			$("#mollify-version").addClass("update");
		}
	});
}

function loadPlugin(list, i) {
	var id = list[i];
	var cb = function() {
		plugins[id] = eval("init"+id+"();");
		
		i++;
		if (i == list.length)
			buildMenu();
		else
			loadPlugin(list, i++);
	};
	loadScript("../plugin/"+id+"/admin/init.js", cb);
}
		
function onSelectMenu(id) {
	if (!controllers[id]) {
		onError("Configuration view not defined: "+id);
		return;
	}
	
	loadScript(controllers[id]['path_prefix']+controllers[id]['script'], function() { initView(controllers[id]); });
}

function loadScript(script, cb) {
	if (!script || $.inArray(script, loadedScripts) >= 0) {
		if (cb) cb();
		return;
	}
	$.getScript(script, function() {
		loadedScripts.push(script);
		if (cb) cb();
	});
}

function initView(controllerSpec) {
	setTitle(controllerSpec.title);
	
	controller = eval("new "+controllerSpec['class']+"()");
	if (controller.pageUrl) $("#page").load(controllerSpec['path_prefix'] + controller.pageUrl, "", onLoadView);
}

function onLoadView() {
	initWidgets();
	controller.onLoadView();
}

function getScriptLocation() {
	return session['script_location'];
}
			
function getSession() {
	return session;
}

function getSettings() {
	return mollify.admin.settings;
}

function notify(msg) {
	alert(msg);	//TODO some other notification that doesn't require user dismissal
}

function onUnauthorized() {
	$("body").load("unauthorized.html", "", initWidgets);
}

function onServerError(error) {
	if (error.code == 100) {
		onUnauthorized();
		return;
	}
	var errorHtml = $.template("<div class='error'><div class='title'>${title}</div><div class='details'>${details}</div><div id='error-info'><div id='error-info-title'>Details</div><div id='error-info-content'>${info}</div></div></div>");
	$("body").html(errorHtml, {title: error.error, details: error.details, info: (error.trace ? error.trace : '' ) });
	
	if (!error.trace) {
		$('#error-info').hide();
	} else {
		$('#error-info-content').hide();
		$('#error-info-title').click(function(){ $('#error-info-title').toggleClass("open"); $('#error-info-content').slideToggle(); });
	}
}

function onError(error) {
	setTitle("Error");
	$("#page").html("<div class='error'><div class='title'>"+error+"</div></div>");
}

function setTitle(title) {
	$("#page-title").html(title);
}

function enableButton(id, enabled) {
	if (!enabled) $("#"+id).addClass("ui-state-disabled");
	else $("#"+id).removeClass("ui-state-disabled");
}

function getDateFormat() {
	return getSettings()["date-format"];
}

function getDateTimeFormat() {
	return getSettings()["datetime-format"];
}

function formatDate(d) {
	return $.datepicker.formatDate(getDateFormat(), d);
}

function formatDateTime(time) {
	return time.format(getDateTimeFormat());
}

function parseDate(d) {
	var t = $.datepicker.parseDate(getDateFormat(), d);
	t.setHours("00");
	t.setMinutes("00");
	t.setSeconds("00");
	return t;
}

function parseInternalTime(time) {
	var ts = new Date();
	ts.setYear(time.substring(0,4));
	ts.setMonth(time.substring(4,6) - 1);
	ts.setDate(time.substring(6,8));
	ts.setHours(time.substring(8,10));
	ts.setMinutes(time.substring(10,12));
	ts.setSeconds(time.substring(12,14));
	return ts;
}

function formatInternalTime(time) {
	return time.format('yymmddHHMMss', time);
}

function initWidgets() {
	$('button').each(function() {
		$(this).hover(
			function(){ 
				$(this).addClass("ui-state-hover"); 
			},
			function(){ 
				$(this).removeClass("ui-state-hover"); 
			}
		);
	});
	
	$('.toggle-panel').each(function() {
		$(this).children('.toggle-panel-content').hide();
		$(this).children('.toggle-panel-title').click(function(){
			$(this).toggleClass("open"); $(this).parent().children('.toggle-panel-content').slideToggle();
		});
	});
}

function generatePassword() {
	var length = 8;
	var password = '';
	
    for (i = 0; i < length; i++) {
    	while (true) {
	        c = getRandomNumber();
	        if (isValidPasswordChar(c)) break;
		}
        password += String.fromCharCode(c);
    }
    return password;
}

function isValidPasswordChar(c) {
    if (c >= 33 && c <= 47) return false;
    if (c >= 58 && c <= 64) return false;
    if (c >= 91 && c <= 96) return false;
    if (c >= 123 && c <=126) return false;
    return true;
}

function getRandomNumber() {
	return (parseInt(Math.random() * 1000) % 94) + 33;
}

function inArray(o, a) {
	if (!a) return false;
	for (var i=0; i < a.length; i++) {
		if (a[i] == o) return true;
	}
	return false;
}

Date.prototype.format = function(format) {
	var date = this;
	if (!format) format="mm/dd/yy";               
 
	var month = date.getMonth() + 1;
	var year = date.getFullYear();    
	var hours = date.getHours();
	 
	format = format.replace("mm", month.toString().padL(2,"0"));        

	if (format.indexOf("yy") > -1)
		format = format.replace("yy", year.toString());
 
    format = format.replace("dd",date.getDate().toString().padL(2,"0"));

	if (format.indexOf("t") > -1) {
		if (hours > 11)
			format = format.replace("t","pm")
		else
			format = format.replace("t","am")
	}
	
	if (format.indexOf("HH") > -1)
		format = format.replace("HH", hours.toString().padL(2,"0"));
		
	if (format.indexOf("hh") > -1) {
		if (hours > 12)
			hours = hours - 12;
		if (hours == 0)
			hours = 12;
		format = format.replace("hh", hours.toString().padL(2,"0"));        
	}

	if (format.indexOf("MM") > -1)
		format = format.replace("MM", date.getMinutes().toString().padL(2,"0"));

	if (format.indexOf("ss") > -1)
		format = format.replace("ss", date.getSeconds().toString().padL(2,"0"));

    return format;
}

String.repeat = function(chr,count) {    
    var str = ""; 
    for (var x=0; x<count; x++) str += chr;
    return str;
}

String.prototype.padL = function(width, pad) {
	if (!width || width < 1) return this;
	if (!pad) pad = " ";
    
	var length = width - this.length
	if (length < 1) return this.substr(0, width);
    
	return (String.repeat(pad,length) + this).substr(0,width);    
}
 
String.prototype.padR = function(width, pad) {
    if (!width || width < 1) return this;
	if (!pad) pad = " ";

	var length = width - this.length
	if (length < 1) this.substr(0, width);
	return (this + String.repeat(pad,length)).substr(0,width);
}

function getValidSelections(list) {
	var result = [];
	for (var i=0; i < list.length; i++) {
		var v = list[i];
		if (!v || v.length == 0) continue;
		result.push(v);
	}
	return result;
}

// jqGrid formatters

function timeFormatter(time, options, obj) {
	return formatDateTime(time);
}
	
function notNullFormatter(o, options, obj) {
	if (o == null) return '';
	return o;
}

/*
  This license is based on the new BSD template found here 
  (http://www.opensource.org/licenses/bsd-license.php)
  
  -----------------------------------------------------------------
  CodeIncubator (http://codeincubator.com)
  Copyright (c) 2009 
  by Steven Harman (http://stevenharman.net)
  
  All rights reserved.
  
  Redistribution and use in source and binary forms, with or without modification, 
  are permitted provided that the following conditions are met:
  
      * Redistributions of source code must retain the above copyright notice, 
                this list of conditions and the following disclaimer.
      * Redistributions in binary form must reproduce the above copyright notice, 
                this list of conditions and the following disclaimer in the documentation 
                and/or other materials provided with the distribution.
      * Neither the name of the CodeIncubator nor the names of its contributors 
                may be used to endorse or promote products derived from this software 
                without specific prior written permission.
  
  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. 
  IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, 
  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, 
  BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, 
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY 
  OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE 
  OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
  OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function($) {
	jQuery.jgrid.fluid = {
    	fluidGrid: function(options) {
			var grid = $(this);
			
			var settings = $.extend({
				example: grid.closest('.ui-jqgrid').parent(),
				offset: 0
            }, options || {});
			
			var w = $(settings.example).innerWidth() + settings.offset;
			if (w <= 0) return;
			
			grid.setGridWidth(w);
    	}
	}}
)(jQuery);
	
jQuery.fn.extend({ fluidGrid : jQuery.jgrid.fluid.fluidGrid });