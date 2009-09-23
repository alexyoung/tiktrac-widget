var TiktracProfile = {
	login_valid: false,
	Email: function() { return widget.preferenceForKey('userEmail') },
	Pass: function() { return widget.preferenceForKey('userPass') },
	AccountName: function() { return widget.preferenceForKey('userAccountName') },
    Sheet: function() { return widget.preferenceForKey('userSheet') },
    setSheet: function(value) { return widget.setPreferenceForKey(value + '', 'userSheet') },
    
	set: function(key, value)
	{
		if (TiktracProfile[key]() != value)
		{
			widget.setPreferenceForKey(value, 'user' + key)
			this.login_valid = false
			check_login()
		}
	},
    
    saveFromBack: function()
    {
        widget.setPreferenceForKey($('accountname').value, "userAccountName")
        widget.setPreferenceForKey($('email').value, "userEmail")
        widget.setPreferenceForKey($('password').value, "userPass")
    }
}

var Feedback = {
	busy: function()
	{
		this.message(getLocalizedString('loading'))
	},
	
	message: function(message)
	{
		this.write('<div id="feedback">#{message}</div>'.interpolate({ message: message }))
	},
	
	clear: function()
	{
        clear_tasks_content()
		if ($('feedback')) $('feedback').remove()
	},

	write: function(content)
	{
		this.clear()
		$('tasks').insert(content, { position: 'top' })
	}
}

var Tiktrac = Class.create({
	initialize: function()
	{
        this.refreshData();
        this.sheets.node.observe('change', this.changeSheet.bindAsEventListener(this));

		$('logo').observe('click', function(event) {
			widget.openURL('http://www.tiktrac.com/');
			event.stop();
            return false;
		})

		$('bug-report').observe('click', function(event) {
			widget.openURL('http://helicoid.loomapp.com/public/tiktracdashboardwidget');
			event.stop();
            return false;
		})
        
        $('add').observe('click', this.displayNewTaskform.bindAsEventListener(this));
        document.observe('click', this.submitNewTask.bindAsEventListener(this));
        document.observe('click', this.deleteTaskPrompt.bindAsEventListener(this));
	},
    
    refreshData: function() {
		this.sheets = new Sheets('sheets', this);
        this.tasks = new Tasks('tasks', this);
        this.sheets.getSheets();
    },
    
    prompt: function(parent, question, options, callback) {
        var option_text = '';
        
        if (options['ok']) {
            option_text += '<a href="#" id="delete_prompt_ok">' + options['ok'] + '</a>';
        }
        
        if (options['cancel']) {
            option_text += '<a href="#" onclick="$(\'prompt\').remove()">' + options['cancel'] + '</a>';
        }
        
        var html = '<em id="prompt" class="error"><strong>' + question + '</strong><div class="options">' + option_text + '</div></em>';
        parent.insert({ before: html });
        $('prompt').setStyle({ 'z-index': 1000 });
        $('delete_prompt_ok').observe('click', function() { callback() });
    },
    
    deleteTaskPrompt: function(event) {
        var element = Event.element(event);
        if (!element.hasClassName('delete')) return;

        var task_id = element.up('li').id.replace(/task-/, '');

        this.prompt(element, 'Are you sure you want to delete that task?', { ok: 'OK', cancel: 'Cancel' }, function() { this.deleteTask(task_id) }.bindAsEventListener(this));
        $('prompt').clonePosition(element, { offsetTop: 20, offsetLeft: -144, setWidth: false, setHeight: false });
        
        Event.stop(event);
        return false;
    },
    
    deleteTask: function(task_id) {
        var request = new TiktracRequest
        request.send('tasks/' + task_id + '?_method=delete', this.deleteTaskCallback.bind(this), {method: 'post'})
    },
    
    deleteTaskCallback: function(transport) {
        this.tasks.getTasks(TiktracProfile.Sheet())
    },
    
    displayNewTaskform: function() {
        if (!TiktracProfile.Sheet()) return;
        if ($('task-new') && $('task-new').visible()) return;
        
        var format = this.sheets.getTimeFormat(TiktracProfile.Sheet())
        var taskHTML = '<li id="task-new" class="task"><input type="checkbox" id="new-task-status" name="task[status]" class="status" checked="checked" value="completed" />'
        taskHTML += '<span class="description"><input type="text" id="new-task-description" name="task[description] class="description" value="" /></span>'
        taskHTML += '<span class="duration_new"><input type="text" id="new-task-duration" name="task[duration] value="" /> <em class="minutes">' + format + '</em></span>'
        taskHTML += '<span class="new_save"><input type="submit" id="save-new-task" value="Save" /> <a href="#" onclick="$(\'task-new\').remove()">Cancel</a></span>'
        taskHTML += '</li>'

        $('tasks').insert({ top: taskHTML });
        $$('#tasks span.description input').first().focus();
    },
    
    submitNewTask: function(event) {
        var element = Event.element(event);
        if (element.id == 'save-new-task') {
            this.createTask({ duration: $('new-task-duration').value, description: $('new-task-description').value, status: $('new-task-status').checked, sheet_id: TiktracProfile.Sheet() });
            event.stop();
            return false;
        }
    },
    
    createTask: function(task) {
        var request = new TiktracRequest;
        var status = task['status'] === true ? 'completed' : 'open';
        var taskXML = '<task><state>' + status + '</state>';
        taskXML += '<sheet_id>' + task['sheet_id'] + '</sheet_id>';
        taskXML += '<description>' + task['description'] + '</description>';
        taskXML += '<duration>' + task['duration'] + '</duration></task>';

        request.send('tasks', this.createTaskCallback.bind(this), {postBody: taskXML, method: 'post'});
    },
    
    createTaskCallback: function(transport) {
        var error_text = '';
        $A(transport.responseText.match(/<error>.*<\/error>/g)).each(function(error) {
            error = error.replace(/<error>(.*)<\/error>/, '$1');
            error_text += '<li>' + error + '</li>';
        })
        
        if (error_text.length == 0) {
            $('task-new').remove();
            // Reload the tasks for this sheet
            this.tasks.getTasks(TiktracProfile.Sheet());
        } else {
            error_text = '<ul>' + error_text + '</ul>';
            this.prompt($('task-new'), error_text, { ok: 'OK' }, function() { $('prompt').remove() }.bindAsEventListener(this))
            $('prompt').addClassName('leftArrow')
            $('prompt').clonePosition($('task-new'), { offsetTop: 34, offsetLeft: 80, setWidth: false, setHeight: false })
        }
    },
    
    changeSheet: function(option) {
        Feedback.busy()
        
        if (this.tasks.timer.running)
        {
            this.tasks.stopTimer()
        }

        var sheetID = typeof(option) == 'string' ? option : $F(Event.element(option))
        this.tasks.format = this.sheets.getTimeFormat(sheetID)
        this.tasks.getTasks(sheetID)
        
        // Save the sheet ID
        TiktracProfile.setSheet(sheetID)
    }
})

var Tasks = Class.create({
    initialize: function(node, tiktrac)
	{
		this.node = $(node)
        this.request = new TiktracRequest
        this.tiktrac = tiktrac
        
		this.timer = new Timer()
		this.tasks = null
		this.format = null
		this.current = null

		this.scrollArea = false

		this.taskHTML = '<li id="task-#{id}" class="task"><input type="checkbox" name="task#{id}" class="status" value="completed"#{status} /><span class="description" title="Click to edit">#{description}</span>#{duration}</li>'
		this.minutesHTML = '<span class="duration minutes"><em class="minutes">#{minutes}</em> mins <span class="seconds wrapper" style="display:none"><em class="seconds">0</em> secs</span></span>'
		this.hoursHTML = '<span class="duration hours"><em class="hours">#{hours}</em> hours <em class="minutes">#{minutes}</em> mins <span class="seconds wrapper" style="display:none"><em class="seconds">0</em> secs</span></span>'
    },

	getTasks: function(sheet)
	{
        /* Reset the timers */
        this.task_timer_elapsed = {};
        
        var callback = function(transport) {
            if (transport.responseXML == null) return
	  
            var tasks = $A(transport.responseXML.firstChild.getElementsByTagName('task')).collect(function(task)
            {
                var taskID = task.getElementsByTagName('id')[0].firstChild.data
                var taskDuration = task.getElementsByTagName('duration')[0].firstChild.data
                var taskDescription = task.getElementsByTagName('description')[0].firstChild.data
                var taskState = task.getElementsByTagName('state')[0].firstChild.data

                return {id: taskID, description: taskDescription, duration: taskDuration, status: taskState}
            }.bind(this))

            this.displayTasks(tasks)
        }.bind(this)

        this.request.send('sheets/' + sheet + '/tasks?view=all', callback)
	},

	displayTasks: function(tasks)
	{
		this.tasks = tasks
		var taskList = ''
        
        if ($('feedback')) {
            Feedback.clear()
            clear_tasks_content()
        }

        this.tasks.each(function(task) {
			var statusHTML = (task.status == 'completed') ?	statusHTML = ' checked="checked"' : ''
			var duration = ''

			if (this.format == 'hours')
			{
				var time = this.splitTime(task.duration)

				duration = this.hoursHTML.interpolate({hours: time.hours, minutes: Math.round(time.minutes)})
			}
			else if (this.format == 'minutes')
			{
				duration = this.minutesHTML.interpolate({minutes: task.duration})
			}
            
            duration = duration + '<img class="delete" src="Images/trash.gif" >'

			taskList += this.taskHTML.interpolate({id: task.id, status: statusHTML, description: task.description, duration: duration})
        }.bind(this))

        this.node.innerHTML = taskList

		this.node.childElements().each(function(task) {
			new EditInPlace(task.down('span.description'), this.updateDescription.bind(this), task)
		}.bind(this))

		if (!this.scrollArea)
		{
			scroll_bar = new AppleVerticalScrollbar($("task-container"))
			scroll_area = new AppleScrollArea($("content"))
			scroll_area.addScrollbar(scroll_bar)
		}

		this.setObservers()
	},

	updateStatus: function(task)
	{
		var completed = task.down('input.status').checked
		var id = this.getID(task)
		var status = (completed) ? 'completed' : 'open'

		this.request.send('tasks/' + id + '?_method=put', function(){}, {postBody: '<task><state>' + status + '</state></task>', method: 'post'})
	},

	updateDescription: function(task, description)
	{
		this.request = new TiktracRequest
		var id = task.id.replace('task-', '')
        var callBack = function(transport) { this.updateTaskCallback(transport, task) }.bind(this)
        
		this.request.send('tasks/' + id + '?_method=put', callBack, {onFailure: callBack, postBody: '<task><description>' + description + '</description></task>', method: 'post'})
	},

    updateTaskCallback: function(transport, task) {
        var error_text = ''
        $A(transport.responseText.match(/<error>.*<\/error>/g)).each(function(error) {
            error = error.replace(/<error>(.*)<\/error>/, '$1')
            error_text += '<li>' + error + '</li>'
        })
        
        if (error_text.length > 0) {
            error_text = '<ul>' + error_text + '</ul>'
            this.tiktrac.prompt(task, error_text, { ok: 'OK' }, function() { $('prompt').remove() }.bindAsEventListener(this))
            $('prompt').addClassName('leftArrow')
            /* When there's a problem with the description field change the default */
            task.down('span.description').innerHTML = 'Please enter a value'
            $('prompt').clonePosition(task, { offsetTop: 34, offsetLeft: 80, setWidth: false, setHeight: false })
        }
    },

    updateDuration: function(duration) {
        var id = this.getID(this.current)
        this.request.send('tasks/' + id + '?_method=put', function(){}, {postBody: '<task><duration>' + duration + '</duration></task>', method: 'post'})
        
        /* Update the task's duration in the internal array */
        if (this.tasks != null) {
            this.tasks = this.tasks.collect(function(task) {
                if (task.id == id) {
                    task.duration = duration;
                }
                return task;
            });
        }
    },

	startTimer: function(taskNode)
	{
		this.stopTimer() // Stop any current tasks
		this.current = taskNode
		this.current.down('span.seconds.wrapper').show()
		this.current.addClassName('running')
		var id = this.getID(taskNode)
		var task = this.getRunningTask(id)

        if (this.task_timer_elapsed[id]) {
            this.timer.elapsed = this.task_timer_elapsed[id];
        } else {
            if (this.format == 'hours')
            {
                this.timer.elapsed = task.duration * 60 * 60
            }
            else if (this.format == 'minutes')
            {
                this.timer.elapsed = task.duration * 60
            }
        }
        
		this.timer.start(function() {
			seconds = Math.round(this.timer.elapsed % 60)

			if (this.format == 'hours')
			{
				minutes = Math.round(((this.timer.elapsed-seconds) / 60) % 60)
				hours = Math.round(((this.timer.elapsed / 60) - minutes) / 60)
				this.current.down('em.hours').innerHTML = hours

				duration = Math.round(this.timer.elapsed / 60) / 60
			}
			else if (this.format == 'minutes')
			{
				minutes = (this.timer.elapsed-seconds) / 60
				duration = minutes
			}

			this.current.down('em.minutes').innerHTML = minutes
			this.current.down('em.seconds').innerHTML = seconds

            /* Save to Tiktrac every minute */
			if (seconds == 0 && minutes > 0)
			{
				this.updateDuration(duration)
			}

            /* Update elapsed */
			this.timer.elapsed++;
            this.task_timer_elapsed[id] = this.timer.elapsed;
		}.bind(this))
	},

	stopTimer: function()
	{
		if (this.current != null)
		{
			this.timer.stop()
			this.current.down('span.seconds.wrapper').hide()
			this.current.removeClassName('running')
            this.updateDuration(duration)

			return true
		}
		else
		{
			return false
		}
	},

	setObservers: function()
	{
		this.node.select('li.task').each(function(task) {
			task.down('span.duration').observe('click', function(event) {
				if (!this.timer.running)
				{
					this.startTimer(task)
				}
				else
				{
					this.stopTimer()
				}
			}.bind(this))

			task.down('input').observe('click', function(event) {
				this.updateStatus(task)
			}.bind(this))
		}.bind(this))
	},

	getRunningTask: function(id)
	{
		return this.tasks.find(function(task) {
			return task.id == id
		})
	},

	getID: function(task)
	{
		return task.id.replace('task-', '')
	},

	splitTime: function(time)
	{
		minutes = (time*60)%60
		hours = ((time*60)-minutes)/60

		return {hours: hours, minutes: minutes}
	},

	hoursToMinutes: function(time)
	{
		return (time*60)
	}
})

var Sheets = Class.create({
    initialize: function(node, tiktrac)
	{
		this.node = $(node)
        this.request = new TiktracRequest
        this.sheetHTML = '<option value="#{id}" id="#{dom_id}">#{name}</option>'
		this.sheets = null
        this.tiktrac = tiktrac
    },

    getSheets: function()
    {
        var callback = function(transport) {
            if (transport.responseXML == null) return

            this.sheets = $A(transport.responseXML.firstChild.getElementsByTagName('sheet')).collect(function(sheet)
            {
                var sheetID = sheet.getElementsByTagName('id')[0].firstChild.data
                var sheetName = sheet.getElementsByTagName('name')[0].firstChild.data
                var timeFormat = sheet.getElementsByTagName('time-format')[0].firstChild.data
                return {id: sheetID, name: sheetName, timeFormat: timeFormat}
            }.bind(this))

            this.displaySheets()
        }.bind(this)

        this.request.send('sheets', callback)
    },

    displaySheets: function()
    {
        var sheetList = this.sheetHTML.interpolate({id: '', name: 'Select a sheet...', dom_id: 'first_sheet_entry'}) // Set the first entry

        this.sheets.each(function(sheet) {
            sheetList += this.sheetHTML.interpolate({id: sheet.id, name: sheet.name, dom_id: 'Sheet_' + sheet.id})
        }.bind(this))

        this.node.innerHTML = sheetList;
        var selectedSheetId = TiktracProfile.Sheet();
        if (parseInt(selectedSheetId) == 0) {
            selectedSheetId = this.sheets.first().id;
        }
        
        try {
            $('Sheet_' + selectedSheetId).selected = true;
            this.tiktrac.changeSheet(selectedSheetId);
        } catch (exception) {
        }
    },

	getTimeFormat: function(sheetID)
	{
		return this.sheets.find(function(sheet) {
			return sheet.id == sheetID;
		}).timeFormat
	}
})

var Timer = Class.create({
	initialize: function()
	{
		this.currentTask = null
		this.updateFrequency = 1 // seconds
		this.timer = null
		this.elapsed = 0
		this.running = false
	},

	start: function(callback)
	{
		this.timer = new PeriodicalExecuter(callback, this.updateFrequency)
		this.running = true
	},

	stop: function()
	{
		this.timer.stop()
		this.running = false
	}
});

var EditInPlace = Class.create({
	initialize: function(target, callback, params) {
		this.target = target;
		this.callback = callback;
		this.params = params;
		this.originalContent = target.innerHTML;
		this.newContent = '';
		this.active = false;

        this.formHTML = '<form class="editinplace" action=""><input type="text" name="field" value="#{description}" class="value" /><input type="submit" value="Save" class="save" /><a href="" class="cancel">Cancel</a></form>';

		target.observe('click', this.edit.bindAsEventListener(this));
	},

	edit: function(event) {
		event.stop();

		if (!this.active) {
			this.target.innerHTML = this.formHTML.interpolate({description: this.target.innerHTML});
			this.target.down('form.editinplace').down('input.save').observe('click', this.save.bindAsEventListener(this));
			this.target.down('form.editinplace').down('a.cancel').observe('click', this.cancel.bindAsEventListener(this));
		}

		this.active = true;
	},

	save: function(event) {
		event.stop();
		this.newContent = this.target.down('form.editinplace').down('input.value').value;
		this.callback(this.params, this.newContent);

        if (this.newContent.length > 0) {
            this.target.innerHTML = this.newContent;
            this.originalContent = this.target.innerHTML;
        }
		this.active = false;
	},

	cancel: function(event) {
		event.stop();
		this.target.innerHTML = this.originalContent;
		this.active = false;
	}
})