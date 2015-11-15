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
	console.log('Serialized schedule: ' + JSON.stringify(result))
	return result
}

function sendNextEvent () {
	Pebble.sendAppMessage(
		serializeSchedule(getScheduleForToday()),
		function (e) {
			console.log('Successfully delivered message with transactionId=' + e.data.transactionId)
		},
		function (e) {
			console.log('Unable to deliver message with transactionId=' + e.data.transactionId + ' Error is: ' + e.error.message)
		}
	)
}

Pebble.addEventListener('ready', function (e) {
	console.log('READY. Event: ' + JSON.stringify(e) + ' Schedules: ' + JSON.stringify(getSchedules()))
	sendNextEvent()
})

Pebble.addEventListener('appmessage', function (e) {
	console.log('APPMESSAGE. Event: ' + JSON.stringify(e))
	if (e.payload.get) sendNextEvent()
})

Pebble.addEventListener('showConfiguration', function (e) {
	Pebble.openURL('https://unrelenting.technology/classyclock/static/settings.html#' + encodeURIComponent(JSON.stringify({'schedules': getSchedules()})))
})

Pebble.addEventListener('webviewclosed', function (e) {
	var rsp = JSON.parse(decodeURIComponent(e.response))
	if (typeof rsp === 'object') {
		setSchedules(rsp.schedules)
		sendNextEvent()
	}
})
