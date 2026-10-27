#include <gtest/gtest.h>

#include <QCoreApplication>

#include "control/controlobject.h"
#include "effects/backends/effectmanifestparameter.h"
#include "effects/effectslot.h"
#include "test/signalpathtest.h"

namespace {

const QString kSlot = QStringLiteral("[EffectRack1_EffectUnit1_Effect1]");

class EffectSlotScriptApiTest : public BaseSignalPathTest {
  protected:
    EffectSlotScriptApiTest() {
        m_pEffectsManager->setup();
    }

    double get(const QString& key) {
        return ControlObject::get(ConfigKey(kSlot, key));
    }
};

TEST_F(EffectSlotScriptApiTest, LoadsByIdAndSetsParametersById) {
    ASSERT_TRUE(EffectSlot::requestLoadEffect(kSlot,
            QStringLiteral("org.mixxx.effects.beatdelay"),
            {{QStringLiteral("time"), 2.0}, {QStringLiteral("glide"), 1.0}}));
    // Nothing happens until the slot's thread runs the queued request.
    EXPECT_EQ(0.0, get(QStringLiteral("loaded")));
    QCoreApplication::processEvents();

    EXPECT_EQ(1.0, get(QStringLiteral("loaded")));
    EXPECT_DOUBLE_EQ(2.0, get(QStringLiteral("parameter1")));
    EXPECT_EQ(1.0, get(QStringLiteral("button_parameter1")));
    EXPECT_EQ(static_cast<double>(EffectManifestParameter::LinkType::None),
            get(QStringLiteral("parameter1_link_type")));

    ASSERT_TRUE(EffectSlot::requestSetParameter(kSlot, QStringLiteral("time"), 4.0));
    QCoreApplication::processEvents();
    EXPECT_DOUBLE_EQ(4.0, get(QStringLiteral("parameter1")));
}

TEST_F(EffectSlotScriptApiTest, KeepsTheEffectWhenLoadedAgain) {
    const QString id = QStringLiteral("org.mixxx.effects.beatdelay");
    ASSERT_TRUE(EffectSlot::requestLoadEffect(kSlot, id, {{QStringLiteral("time"), 2.0}}));
    QCoreApplication::processEvents();
    // A reload would reset the time to its default.
    ASSERT_TRUE(EffectSlot::requestLoadEffect(kSlot, id, {{QStringLiteral("feedback"), 0.2}}));
    QCoreApplication::processEvents();
    EXPECT_DOUBLE_EQ(2.0, get(QStringLiteral("parameter1")));
    EXPECT_DOUBLE_EQ(0.2, get(QStringLiteral("parameter2")));
}

TEST_F(EffectSlotScriptApiTest, ReloadStartsTheEffectAfresh) {
    const QString id = QStringLiteral("org.mixxx.effects.beatdelay");
    ASSERT_TRUE(EffectSlot::requestLoadEffect(kSlot, id, {{QStringLiteral("time"), 2.0}}));
    QCoreApplication::processEvents();
    ASSERT_TRUE(EffectSlot::requestLoadEffect(kSlot, id, {}, true));
    QCoreApplication::processEvents();
    EXPECT_DOUBLE_EQ(0.5, get(QStringLiteral("parameter1")));
}

TEST_F(EffectSlotScriptApiTest, RejectsUnknownSlotOrEffect) {
    EXPECT_FALSE(EffectSlot::requestLoadEffect(QStringLiteral("[EffectRack1_EffectUnit9_Effect9]"),
            QStringLiteral("org.mixxx.effects.echo"),
            {}));
    EXPECT_FALSE(EffectSlot::requestLoadEffect(kSlot, QStringLiteral("org.mixxx.effects.none"), {}));
    EXPECT_FALSE(EffectSlot::requestSetParameter(
            QStringLiteral("[EffectRack1_EffectUnit9_Effect9]"), QStringLiteral("time"), 1.0));
}

} // namespace
