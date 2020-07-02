var log = [];

// will prompt the user for permissions
function twelveHourTime(time) {
  eval(UrlFetchApp.fetch('https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.24.0/moment.min.js').getContentText());
  return moment(time).format('ha');
}

function toPercent(n) {
  return parseInt(n * 100) + '%';
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function myFunction(d) {
  
  var id = Session.getActiveUser().getEmail();
  var days = d || 28; // analysis period (Eg, over past month)
  var workingHours = 8 * 60;  // minutes per day
  var workingDays = days - ((days / 7) * 2) // take out weekends from # of days analysis
  var hourlyRate = 340 / 7.5; 
  var calendar = CalendarApp.getCalendarById(id)
  var now = new Date();
  var standardSubsPrice = 278.20;
  var daysAgoFromNow = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  var events = calendar.getEvents(daysAgoFromNow, now);
  var totalDuration = 0;
  var totalDurationRecurring = 0;
  var totalDurationOwner = 0;
  var londonISRRatePerMinute = 346/(7.5*60); // UK ISR per minute
  
  for(var i=0; i<events.length; i++){
    
    var flag = false;
    var duration = (events[i].getEndTime() - events[i].getStartTime()) / 60000; // ms -> minutes
    var guestStatus = 'UNKNOWN';
    var guests = events[i].getGuestList(true);

    // have I accepted?
    for(var j=0; j<guests.length; j++){
      if (guests[j].getEmail() === id) {
        guestStatus = guests[j].getGuestStatus();
      }
    }

    // remove things you've stuck in your calendar yourself & things you've not accepted
    if (guestStatus == 'YES' || guestStatus == 'OWNER') {
    
      if (events[i].isRecurringEvent()) {
        totalDurationRecurring = totalDurationRecurring + duration;
      }
      
      totalDuration = totalDuration + duration;
      
      // do I appear in the list of creators
      var owner = events[i].getCreators().indexOf(id) >= 0;
      
      if (owner) {
        totalDurationOwner = totalDurationOwner + duration;
      }
      
      var date = events[i].getStartTime().toISOString();
      var yyyymmdd = date.split('T')[0];
      
      var isTooLong = duration > (7 * 60); // eliminate false long meetings
      var hasTwoPeople = events[i].getGuestList(true).length > 1
      
      if (hasTwoPeople || !isTooLong) { // a meeting needs 2 people!
        flag = true;
      }
    }
      
    var cost = londonISRRatePerMinute * events[i].getGuestList(true).length * duration;
    var subs = Math.floor(cost / standardSubsPrice);
     
    log.push({
      isMeeting: flag,
      attendees: events[i].getGuestList(true).length, 
      date: date,
      day: yyyymmdd, 
      duration: duration,
      cost: cost.toFixed(0),
      subs: subs,
      startTime: events[i].getStartTime().getHours(),
      startTimeTwelveHour: twelveHourTime(events[i].getStartTime()),
      title: events[i].getTitle(),
      owner: owner,
      attending: (guestStatus == 'YES') ? 'ATTENDING' : guestStatus,
      recurs: events[i].isRecurringEvent(),
      location: events[i].getLocation(),
      source: events[i]
      }
    );
  }
   
  // only analyse meetings attended
  var attended = log.filter(function(a) { return a.isMeeting });
  
  var minutesInMeetings = attended.reduce(function(a, b) {
    return a + b.duration;
  }, 0);
  
  var hoursInMeetings = (minutesInMeetings / 60).toFixed(0);
  
  var minutesInPeriod = workingDays * workingHours;

  var costTotal = attended.reduce(function(a, b) {
    return parseInt(a) + parseInt(b.cost);
  }, 0);
  
  var morningMeetings = attended.filter(function(a) {
    return a.startTime < 13;
  }, 0);  

  var ownerMeetings = attended.filter(function(a) {
    return a.owner;
  }, 0);
 
  var meetingsThatReccur = ownerMeetings.filter(function(a) {
    return a.recurs;
  }, 0);

  var ownerMeetingsDuration = ownerMeetings.reduce(function(a, b) {
    return a + b.duration;
  }, 0);

  var ownerMeetingsPeople = ownerMeetings.reduce(function(a, b) {
    return a + b.attendees;
  }, 0);

  var ownerMeetingsCost = ownerMeetings.reduce(function(a, b) {
    return parseInt(a) + parseInt(b.cost);
  }, 0);
  
  // blocks of time - 90 minutes
  // meetings > 30 minutes
  // meetings > 10 people
  
  var events = groupByArray(log.reverse(), 'day').map(function (e) {
    var a = e.values.filter(function(a) { return a.isMeeting });
    var freeTime = [].concat.apply([], a.map(function (e) {
        var s = [];
        for (var i=0; i<e.duration/60; i++) { // create an array of non-free hours
          s.push(parseInt(e.startTime + i));
        }
        return s;        
      })).sort(function(a, b) { return a - b });
    e.daily = {
      freeTime: freeTime,
      freeHours: freeTime.filter(function (b) { return b == false; }).length,
      dayOfWeek: dayOfWeek(new Date(e.key).getDay()),
      attended: a.length,
      minutes: (a.reduce(function(a, b) {
        return a + b.duration;
      }, 0) / 60).toFixed(0)
    };
    return e;
  });
  
  return {
    days: days,
    user: Session.getActiveUser().getEmail(),
    data: {
      attended: attended.length,
      minutesInMeetings: minutesInMeetings,
      hoursInMeetings: hoursInMeetings,
      percentTimeInMeetings: toPercent(minutesInMeetings/minutesInPeriod),
      costTotal: costTotal,
      costInSubs: Math.floor(costTotal / standardSubsPrice),
      morningMeetings: morningMeetings,
      ownerMeetings: ownerMeetings,
      meetingsThatReccur: meetingsThatReccur,
      ownerMeetingsDuration: ownerMeetingsDuration,
      ownerMeetingsPeople: ownerMeetingsPeople,
      ownerMeetingsCost: ownerMeetingsCost
      
    },
    events: events
  };
}


// TODO - find the end of *this* week

var groupByArray = function(xs, key) {
    return xs.reduce(function (rv, x) {
        var v = key instanceof Function ? key(x) : x[key];
        var h = rv.filter(function(r) { return r && r.key === v});
        var el = (h) ? h[0] : false;
        if (el) {
            el.values.push(x);
        } else {
            rv.push({ key: v, values: [x] });
        } return rv;
    }, []);
}

var uniqueArray = function(arrArg) {
  return arrArg.filter(function(elem, pos,arr) {
    return arr.indexOf(elem) == pos;
  });
};

var dayOfWeek = function(day) {
   return [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ][day];
}

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  var d = e.parameter.days
  var f = myFunction(d);
  t.data = f.data;
  t.user = f.user;
  t.events = f.events;
  t.days = f.days;
  return t.evaluate();
 }
