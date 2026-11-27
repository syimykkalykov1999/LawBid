package com.lawbid.lawbid

import android.telecom.DisconnectCause
import com.lawbid.lawbid.SystemCallRules.RingVerdict
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SystemCallRulesTest {
    private fun verdict(
        live: Boolean,
        state: Int = SystemCallRules.STATE_RINGING,
        seen: Boolean = true,
        cause: Int? = null,
        recordPresent: Boolean = true,
        recordAccepted: Boolean = false,
        appEnded: Boolean = false,
    ) = SystemCallRules.ringVerdict(live, state, seen, cause, recordPresent, recordAccepted, appEnded)

    @Test
    fun `still ringing waits`() {
        assertEquals(RingVerdict.WAIT, verdict(live = true))
    }

    @Test
    fun `no Telecom call yet waits`() {
        assertEquals(RingVerdict.WAIT, verdict(live = false, seen = false))
    }

    @Test
    fun `Telecom answered while the plugin's record is not accepted = headset or car answer`() {
        assertEquals(
            RingVerdict.SYSTEM_ANSWERED,
            verdict(live = true, state = SystemCallRules.STATE_ACTIVE),
        )
    }

    @Test
    fun `the notification's Accept marks the record in the same step - not the system`() {
        assertEquals(
            RingVerdict.OVER,
            verdict(live = true, state = SystemCallRules.STATE_ACTIVE, recordAccepted = true),
        )
    }

    @Test
    fun `Telecom rejected and the plugin's record stayed = system decline`() {
        assertEquals(
            RingVerdict.SYSTEM_DECLINED,
            verdict(live = false, cause = DisconnectCause.REJECTED),
        )
        assertEquals(
            RingVerdict.SYSTEM_DECLINED,
            verdict(live = false, cause = DisconnectCause.LOCAL),
        )
    }

    @Test
    fun `the app's own decline removes the record - not the system`() {
        assertEquals(
            RingVerdict.OVER,
            verdict(live = false, cause = DisconnectCause.REJECTED, recordPresent = false),
        )
    }

    @Test
    fun `a missed or aborted ring is never a decline`() {
        assertEquals(RingVerdict.OVER, verdict(live = false, cause = DisconnectCause.MISSED))
        assertEquals(RingVerdict.OVER, verdict(live = false, cause = DisconnectCause.UNKNOWN))
    }

    @Test
    fun `a ring the app ended itself is never the system's`() {
        assertEquals(
            RingVerdict.OVER,
            verdict(live = false, cause = DisconnectCause.LOCAL, appEnded = true),
        )
        assertEquals(
            RingVerdict.OVER,
            verdict(live = true, state = SystemCallRules.STATE_ACTIVE, appEnded = true),
        )
    }

    @Test
    fun `hold is heard once and unhold once with two holders`() {
        val gate = SystemCallRules.HoldGate()
        assertEquals("hold", gate.set(SystemCallRules.HOLD_TELECOM, true))
        assertNull(gate.set(SystemCallRules.HOLD_AUDIO, true))
        assertNull(gate.set(SystemCallRules.HOLD_AUDIO, false))
        assertEquals("unhold", gate.set(SystemCallRules.HOLD_TELECOM, false))
        assertNull(gate.set(SystemCallRules.HOLD_TELECOM, false))
    }

    @Test
    fun `the audio watcher alone behaves as before`() {
        val gate = SystemCallRules.HoldGate()
        assertEquals("hold", gate.set(SystemCallRules.HOLD_AUDIO, true))
        assertEquals("unhold", gate.set(SystemCallRules.HOLD_AUDIO, false))
    }

    @Test
    fun `disconnect causes`() {
        assertEquals(DisconnectCause.LOCAL, SystemCallRules.disconnectCode("ended"))
        assertEquals(DisconnectCause.LOCAL, SystemCallRules.disconnectCode(null))
        assertEquals(DisconnectCause.REJECTED, SystemCallRules.disconnectCode("declined"))
        assertEquals(DisconnectCause.MISSED, SystemCallRules.disconnectCode("missed"))
        assertEquals(DisconnectCause.BUSY, SystemCallRules.disconnectCode("busy"))
        assertEquals(DisconnectCause.CANCELED, SystemCallRules.disconnectCode("canceled"))
        assertEquals(DisconnectCause.ERROR, SystemCallRules.disconnectCode("failed"))
    }

    @Test
    fun `only the system's mute changes are passed on`() {
        assertNull(SystemCallRules.muteAction(null, false))
        assertNull(SystemCallRules.muteAction(false, false))
        assertEquals("mute", SystemCallRules.muteAction(false, true))
        assertEquals("unmute", SystemCallRules.muteAction(true, false))
    }
}
