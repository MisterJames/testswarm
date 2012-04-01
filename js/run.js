/**
 * JavaScript file for the "run" page in the browser.
 *
 * @author John Resig, 2008-2011
 * @author Timo Tijhof, 2012
 * @since 0.1.0
 * @package TestSwarm
 */
(function ( $, SWARM, undefined ) {
	var currRunId, currRunUrl, testTimeout, pauseTimer, cmds, errorOut;

	function msg( htmlMsg ) {
		$( "#msg" ).html( htmlMsg );
	}

	function log( htmlMsg ) {
		$( "#history" ).prepend( "<li><strong>" +
			new Date().toString().replace( /^\w+ /, "" ).replace( /:[^:]+$/, "" ) +
			":</strong> " + htmlMsg + "</li>" );
		msg( htmlMsg );
	}

	/**
	 * Softly validate the SWARM object
	 */
	if ( !SWARM.client_id || !SWARM.client ) {
		$( function() {
			msg( "Error: No client id configured! Aborting." );
		});
		return;
	}

	errorOut = 0;
	cmds = {
		reload: function () {
			window.location.reload();
		}
	};

	function retrySend( query, retry, ok ) {
		$.ajax({
			type: "POST",
			url: SWARM.web.contextpath + "/api.php",
			timeout: 10000,
			cache: false,
			data: query,
			dataType: "json",
			success: function () {
				errorOut = 0;
				ok.apply( this, arguments );
			},
			error: function () {
				if ( errorOut > 4 ) {
					cmds.reload();
				} else {
					errorOut += 1;
					msg( "Error connecting to server, retrying..." );
					setTimeout( retry, 15000 );
				}
			}
		});
	}

	function getTests() {
		if ( currRunId === undefined ) {
			log( "Connected to the swarm." );
		}

		currRunId = 0;
		currRunUrl = false;

		msg( "Querying for more tests to run..." );
		retrySend( "action=getrun&client_id=" + SWARM.client_id, getTests, runTests );
	}

	function cancelTest() {
		if ( testTimeout ) {
			clearTimeout( testTimeout );
			testTimeout = 0;
		}

		$( "iframe" ).remove();
	}

	function testTimedout() {
		cancelTest();
		retrySend(
			"action=saverun&fail=-1&total=-1&results=Test%20Timed%20Out.&run_id=" +
				currRunId + "&client_id=" + SWARM.client_id,
			testTimedout,
			function ( data ) {
				if ( data.saverun === "ok" ) {
					SWARM.runDone();
				} else {
					getTests();
				}
			}
		);
	}

	/**
	 * @param data Object: Reponse from api.php?action=getrun
	 */
	function runTests( data ) {
		var norun_msg, timeLeft, runInfo, params, iframe;

		if ( !$.isPlainObject( data ) || data.error ) {
			// Handle session timeout, where server sends back "Username required."
			// Handle TestSwarm reset, where server sends back "Client doesn't exist."
			if ( data.error ) {
				$(function () {
					msg( 'action=getrun failed. ' + $( "<div>" ).text( data.error.info ).html() );
				});
				return;
			}
		}

		if ( data.getrun ) {
			// Handle configuration update
			if ( data.getrun.swarmUpdate ) {

				// Refresh control
				if ( SWARM.client.refresh_control < data.getrun.swarmUpdate.client.refresh_control ) {
					cmds.reload();
					return;
				}

				$.extend( SWARM, data.getrun.swarmUpdate );
			}

			// Handle actual retreived tests from runInfo
			runInfo = data.getrun.runInfo;
			if ( runInfo ) {
				currRunId = runInfo.id;
				currRunUrl = runInfo.url;

				log( "Running " + ( runInfo.desc || "" ) + " tests..." );

				iframe = document.createElement( "iframe" );
				iframe.width = 1000;
				iframe.height = 600;
				iframe.className = "test-runner-frame";
				iframe.src = currRunUrl + (currRunUrl.indexOf( "?" ) > -1 ? "&" : "?")
					// Cache buster
					+ "_=" + new Date().getTime()
					// Homing signal for inject.js so that it can find it's POST target for action=saverun
					// (only used in the <form> fallback in case postMessage isn't supported)
					+ "&swarmURL=" + encodeURIComponent(
						window.location.protocol + "//" + window.location.host + SWARM.web.contextpath
						+ "index.php?run_id=" + currRunId + "&client_id=" + SWARM.client_id
					);

				$( "#iframes" ).append( iframe );

				// Timeout after a period of time
				testTimeout = setTimeout( testTimedout, SWARM.client.timeout_rate * 1000 );

				return;
			}

		}

		// If we're still here then either there are no new tests to run, or this is a call
		// triggerd by an iframe to continue the loop. We'll do so a short timeout,
		// optionally replacing the message by data.timeoutMsg
		clearTimeout( pauseTimer );

		norun_msg = data.timeoutMsg || "No new tests to run.";

		msg( norun_msg );

		// If we just completed a run, do a cooldown_rate timeout before we fetch the next
		// run (if there is one). If we just completed a cooldown a no runs where available,
		// go for a (usually longer, depending on configuration) update_rate timeout instead.
		timeLeft = currRunUrl ? SWARM.client.cooldown_rate : SWARM.client.update_rate;

		pauseTimer = setTimeout(function leftTimer() {
			msg(norun_msg + " Getting more in " + timeLeft + " seconds." );
			if ( timeLeft >= 1 ) {
				timeLeft -= 1;
				pauseTimer = setTimeout( leftTimer, 1000 );
			} else {
				timeLeft -= 1;
				getTests();
			}
		}, 1000);

	}

	// Needs to be a publicly exposed function,
	// so that when inject.js does a <form> submission,
	// it can call this from within the frame
	// as window.parent.SWARM.runDone();
	SWARM.runDone = function () {
		cancelTest();
		runTests({ timeoutMsg: "Cooling down." });
	};

	function handleMessage(e) {
		e = e || window.event;
		retrySend( e.data, function () {
			handleMessage(e);
		}, SWARM.runDone );
	}

	/**
	 * Bind
	 */
	if ( window.addEventListener ) {
		window.addEventListener( "message", handleMessage, false );
	} else if ( window.attachEvent ) {
		window.attachEvent( "onmessage", handleMessage );
	}

	$( document).ready( getTests );

}( jQuery, SWARM ) );
