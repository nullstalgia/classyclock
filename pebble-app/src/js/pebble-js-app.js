var SERVER_HOST = 'https://unrelenting.technology/classyclock'
//SERVER_HOST = 'http://192.168.1.3:4343'
var SETTINGS_URL = SERVER_HOST + '/static/settings.html'
var TIMELINE_URL = SERVER_HOST + '/timeline'

var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
var defaultSchedules = days.map(function (dn) {
	return { 'day': dn, 'schedule': [ { 'start': '23:58', 'end': '23:59', 'subj': 'Edit schedule on phone' } ] }
})

function getSchedules () {
	var ls = localStorage.getItem('schedules')
	if (ls !== null) return JSON.parse(ls).schedules || defaultSchedules
	return defaultSchedules
}

function getScheduleForToday () {
	// Why the hell is "sunday is the first day" even a thing
	var dayNumber = new Date().getDay() - 1
	var today = days[dayNumber == -1 ? days.length - 1 : dayNumber]
	return (getSchedules().filter(function (s) { return s.day == today })[0] || { schedule: [] }).schedule
}

function setSchedules (s) {
	return localStorage.setItem('schedules', JSON.stringify({ schedules: s }))
}

function formatTime (t) {
	// The Pebble app needs a zero-padded number of minutes
	var parts = t.split(':')
	var padded = ('0000' + String(parseInt(parts[0]) * 60 + parseInt(parts[1])))
	return padded.slice(padded.length - 4, padded.length)
}

function serializeSchedule (flat_schedule) {
	var result = {}
	var ctr = 1
	flat_schedule.forEach(function (entry) {
		result[String(ctr)] = formatTime(entry.start) + formatTime(entry.end) + entry.subj.slice(0, 160)
		ctr += 1
	})
	return result
}

function addSettings (message) {
	var INT_MAX = 2147483647
	message[String(INT_MAX - 1)]  = parseInt(localStorage.getItem('vibrateMinutes') || 1)
	message[String(INT_MAX - 10)] = parseInt((localStorage.getItem('colorBg')       || '#FFAAAA').slice(1), 16)
	message[String(INT_MAX - 11)] = parseInt((localStorage.getItem('colorClock')    || '#555500').slice(1), 16)
	message[String(INT_MAX - 12)] = parseInt((localStorage.getItem('colorDate')     || '#555500').slice(1), 16)
	message[String(INT_MAX - 13)] = parseInt((localStorage.getItem('colorTimer')    || '#555500').slice(1), 16)
	message[String(INT_MAX - 14)] = parseInt((localStorage.getItem('colorSubject')  || '#555500').slice(1), 16)
	console.log('Message: ' + JSON.stringify(message))
	return message
}

function sendNextEvent () {
	Pebble.sendAppMessage(
		addSettings(serializeSchedule(getScheduleForToday())),
		function (e) {
			console.log('Successfully delivered message with transactionId=' + e.data.transactionId)
		},
		function (e) {
			console.log('Unable to deliver message with transactionId=' + e.data.transactionId + ' Error is: ' + e.error.message)
		}
	)
}

function storageGetBool (key) {
	try { return JSON.parse(localStorage.getItem(key)) == true } catch (e) { return false }
}

function syncAndSend () {
	sendNextEvent()
	if (storageGetBool('ruzEnabled') && localStorage.getItem('ruzLastUpdated') != formatDate(new Date()))
		fetchRuzSchedule()
	else // done in fetchRuzSchedule on load
		pushToTimeline(false)
}

function formatDate (d) {
	// toISOString converts to UTC!!
	return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

function fetchRuzSchedule () {
	var curr = new Date()
	var firstday = curr.getDate() - curr.getDay() + 1
	var fromdate = formatDate(new Date(curr.setDate(firstday))).replace('-', '.')
	var todate = formatDate(new Date(curr.setDate(firstday + 6))).replace('-', '.')

	var url = 'http://ruz.hse.ru/RUZService.svc/personlessons?' + 'fromdate=' + fromdate + '&todate=' + todate + '&email=' + localStorage.getItem('ruzEmail')
	console.log(url)
	var req = new XMLHttpRequest()
	req.open('GET', url, true)
	req.setRequestHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 5.1.1; One Build/LRX22C.H3) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/39.0.0.0 Mobile Safari/537.36')
	req.setRequestHeader('Accept', 'application/json, text/plain, */*')
	req.setRequestHeader('X-Requested-With', 'ru.hse.ruz')
	req.onload = function () {
		if (req.readyState !== 4 || req.status !== 200) {
			console.log('ruz error')
			pushToTimeline(false)
			return
		}
		var schedule = { 'Monday': [], 'Tuesday': [], 'Wednesday': [], 'Thursday': [], 'Friday': [], 'Saturday': [], 'Sunday': [] }
		JSON.parse(req.responseText).forEach(function (entry) {
			schedule[days[entry.dayOfWeek - 1]].push({
				'start': entry.beginLesson,
				'end':   entry.endLesson,
				'subj':  entry.auditorium + ' ' + entry.discipline
			})
		})
		var result = days.map(function (dn) {
			return { 'day': dn, 'schedule': schedule[dn] }
		})
		console.log('ruz success')
		setSchedules(result)
		sendNextEvent()
		localStorage.setItem('ruzLastUpdated', formatDate(new Date()))
		pushToTimeline(true)
	}
	req.send(null)
}

function pushToTimeline (forceUpdate) {
	if (!storageGetBool('timelineEnabled')) { return }
	if (!forceUpdate && localStorage.getItem('timelineLastUpdated') == formatDate(new Date())) {
		console.log('Timeline already pushed at ' + localStorage.getItem('timelineLastUpdated'))
		return
	}
	Pebble.getTimelineToken(function (token) {
		var curr = new Date()
		var url = TIMELINE_URL + '?token=' + token + '&tz=' + curr.getTimezoneOffset() + '&date=' + formatDate(curr)
		console.log(url)
		var req = new XMLHttpRequest()
		req.open('POST', url, true)
		req.setRequestHeader('Content-Type', 'application/json')
		req.onload = function () {
			if (req.readyState !== 4 || req.status !== 200) {
				console.log('Timeline error')
				return
			}
			console.log('Timeline success')
			localStorage.setItem('timelineLastUpdated', formatDate(new Date()))
		}
		req.send(JSON.stringify(getScheduleForToday()))
	}, function (error) {
		console.log('Timeline token not available: ' + error)
	})
}

Pebble.addEventListener('ready', function (e) {
	console.log('READY. Event: ' + JSON.stringify(e) + ' Schedules: ' + JSON.stringify(getSchedules()))
	syncAndSend()
})

Pebble.addEventListener('appmessage', function (e) {
	console.log('APPMESSAGE. Event: ' + JSON.stringify(e))
	if (e.payload.get)
		syncAndSend()
})

Pebble.addEventListener('showConfiguration', function (e) {
	Pebble.openURL(SETTINGS_URL + '#' + encodeURIComponent(JSON.stringify({
		schedules:         getSchedules(),
		vibrateMinutes:    localStorage.getItem('vibrateMinutes'),
		ruzEmail:          localStorage.getItem('ruzEmail'),
		ruzEnabled:        storageGetBool('ruzEnabled'),
		timelineEnabled:   storageGetBool('timelineEnabled'),
		colorBg:           localStorage.getItem('colorBg'),
		colorClock:        localStorage.getItem('colorClock'),
		colorDate:         localStorage.getItem('colorDate'),
		colorTimer:        localStorage.getItem('colorTimer'),
		colorSubject:      localStorage.getItem('colorSubject'),
	})))
})

Pebble.addEventListener('webviewclosed', function (e) {
	var rsp = JSON.parse(decodeURIComponent(e.response))
	if (typeof rsp === 'object') {
		setSchedules(rsp.schedules)
		localStorage.setItem('vibrateMinutes', rsp.vibrateMinutes)
		localStorage.setItem('ruzEmail', rsp.ruzEmail)
		localStorage.setItem('ruzEnabled', JSON.stringify(rsp.ruzEnabled))
		localStorage.setItem('timelineEnabled', JSON.stringify(rsp.timelineEnabled))
		localStorage.setItem('colorBg', rsp.colorBg)
		localStorage.setItem('colorClock', rsp.colorClock)
		localStorage.setItem('colorDate', rsp.colorDate)
		localStorage.setItem('colorTimer', rsp.colorTimer)
		localStorage.setItem('colorSubject', rsp.colorSubject)
		sendNextEvent()
		if (rsp.ruzEnabled)
			fetchRuzSchedule()
		else
			pushToTimeline(true)
	}
})
