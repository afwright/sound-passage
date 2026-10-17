/* Sound Passage — route presets. Water-only waypoints [lat, lon], Shilshole Bay Marina first.
 * Generated offline: A* over a rasterised OSM coastline, then every leg tested for intersection with the OSM
 * coastline (0 crossings). Still: NOT FOR NAVIGATION — check charts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SP = root.SP || {}; root.SP.routes = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var HOME = [47.6805, -122.4078];
  var AGATE = [[47.711, -122.5671], [47.722, -122.555]];
  var PRESETS = [
    {
      id: 'bainbridge', name: 'Bainbridge — Eagle Harbor (Winslow)', kind: 'Day sail / overnight',
      note: 'West of West Point, across to Wing Point and in through the Eagle Harbor entrance. Watch ferry traffic (Seattle–Bainbridge lane) and the Wing Point rip.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6702,-122.4599],[47.6146,-122.4863],[47.621,-122.5019],[47.621,-122.5109]]
    },
    {
      id: 'blake', name: 'Blake Island State Park', kind: 'Day sail / overnight',
      note: 'Out around West Point, down the west side of the Sound and across to Blake from the north-east. Ends off the park marina.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6702,-122.4599],[47.5622,-122.4743],[47.545,-122.4857]]
    },
    {
      id: 'madison', name: 'Port Madison', kind: 'Day sail / overnight',
      note: 'North-west across the Sound and round Point Monroe into Port Madison; ends at the usual anchorage.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.7254,-122.5259]]
    },
    {
      id: 'kingston', name: 'Kingston (Appletree Cove)', kind: 'Day sail / overnight',
      note: 'Up the Sound to Kingston; ends just outside the Port of Kingston. Watch ferry crossings (Edmonds–Kingston).',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.791,-122.4797],[47.7954,-122.4899]]
    },
    {
      id: 'poulsbo', name: 'Poulsbo (via Agate Passage)', kind: 'Overnight',
      note: 'Port Madison, then Agate Passage (strong current — time it for slack or a fair tide, see the warnings), then round into Liberty Bay and up to Poulsbo.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.727,-122.5301],[47.7226,-122.5553],[47.715,-122.5625],[47.713,-122.5655],[47.7106,-122.5673],[47.6818,-122.5937],[47.6974,-122.6099],[47.7034,-122.6105],[47.707,-122.6201],[47.707,-122.6285],[47.7298,-122.6513],[47.733,-122.6495]]
    },
    {
      id: 'ludlow', name: 'Port Ludlow', kind: 'Overnight',
      note: 'North along the Kitsap shore past Point No Point and Foulweather Bluff, then into Ludlow Bay. Admiralty Inlet current starts to matter.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.9218,-122.5223],[47.9502,-122.6177],[47.9334,-122.6711],[47.921,-122.6801],[47.9206,-122.6831],[47.9206,-122.6849],[47.9218,-122.6867]]
    },
    {
      id: 'townsend', name: 'Port Townsend (Point Hudson)', kind: 'Overnight / multi-day',
      note: 'Up past Point No Point, through Admiralty Inlet past Marrowstone Point and in to Point Hudson. Big currents and tide rips off Point Wilson/Marrowstone; time it.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.9422,-122.5313],[48.0878,-122.6717],[48.1122,-122.6855],[48.1186,-122.7473]]
    },
    {
      id: 'edmonds', name: 'Edmonds', kind: 'Day sail',
      note: 'North up the Seattle shore, offshore of Point Wells, to the Port of Edmonds entrance.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.7326,-122.4239],[47.8106,-122.4005],[47.8106,-122.3957]]
    },
    {
      id: 'langley', name: 'Langley (Whidbey)', kind: 'Overnight',
      note: 'North through Possession Sound (round Possession Point, Clinton ferry lane) and up to Langley on the east shore of Whidbey.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.7326,-122.4239],[47.879,-122.3837],[47.8998,-122.3699],[47.9674,-122.3351],[48.0442,-122.3729],[48.0418,-122.4047]]
    },
    {
      id: 'gig', name: 'Gig Harbor (via Colvos Passage)', kind: 'Overnight',
      note: 'Round West Point, down the west side of the Sound between Blake and Vashon, through Colvos Passage and across to Gig Harbor.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6702,-122.4599],[47.5242,-122.4743],[47.5098,-122.4869],[47.4466,-122.5241],[47.4398,-122.5259],[47.4198,-122.5259],[47.3898,-122.5379],[47.377,-122.5301],[47.3262,-122.5691],[47.3262,-122.5703]]
    },
    {
      id: 'desmoines', name: 'Des Moines Marina', kind: 'Day sail',
      note: 'South down the Sound, past Alki and Three Tree Point, to Des Moines.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6702,-122.4599],[47.439,-122.3873],[47.401,-122.3327]]
    },
    {
      id: 'quartermaster', name: 'Quartermaster Harbor (Vashon/Maury)', kind: 'Overnight',
      note: 'South past Des Moines, round the east side of Maury Island and in to Quartermaster Harbor off Dockton.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6702,-122.4599],[47.405,-122.3765],[47.3834,-122.3615],[47.3342,-122.4605],[47.3458,-122.4821],[47.3642,-122.4803],[47.3802,-122.4659],[47.3802,-122.4599]]
    },
    {
      id: 'bell', name: 'Elliott Bay — Bell Harbor', kind: 'Day sail',
      note: 'Round West Point and in through the Elliott Bay entrance to the Bell Harbor piers. Heavy commercial traffic: keep clear of the Traffic Separation Scheme.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6702,-122.4599],[47.6222,-122.4041],[47.6122,-122.3609]]
    },
    {
      id: 'loop', name: 'Day sail loop: Meadow Point — Point Monroe', kind: 'Day sail',
      note: 'Out past Meadow Point, across to Point Monroe, then back on a mid-Sound course.',
      pts: [[47.6805,-122.4078],[47.677,-122.4109],[47.6757,-122.414],[47.6746,-122.4173],[47.6914,-122.4197],[47.6934,-122.4167],[47.7214,-122.5109],[47.709,-122.4779],[47.689,-122.4401],[47.6757,-122.414],[47.677,-122.4109],[47.6805,-122.4078]]
    }
  ];
  return { HOME: HOME, AGATE: AGATE, PRESETS: PRESETS };
});
