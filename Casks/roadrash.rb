cask "roadrash" do
  version "1.0.0"
  sha256 "2d0491d0c91cd01f9167e829ea87f2e247c47fccf39d18274e89d52467035d91"

  url "https://github.com/shankyty/rickshaw-rider/releases/download/v#{version}/RickshawRider.dmg"
  name "Rickshaw Rider"
  desc "Combat racer where you drive an auto-rickshaw through Indian cities"
  homepage "https://shankyty.github.io/rickshaw-rider/"

  depends_on macos: :ventura

  app "Rickshaw Rider.app"

  # The app is ad-hoc signed (not notarized); clear quarantine so it opens without a Gatekeeper prompt.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "{{appdir}}/Rickshaw Rider.app"]
  end

  # The bundle id still says roadrash: the app's saves live under it.
  caveats <<~EOS
    Road Rash: Rickshaw Rumble is now Rickshaw Rider, and this tap gets no more updates. Switch with:
      brew uninstall --cask roadrash
      brew untap shankyty/roadrash
      brew tap shankyty/rickshaw-rider https://github.com/shankyty/rickshaw-rider
      brew install --cask rickshaw-rider
  EOS

  zap trash: [
    "~/Library/Saved Application State/com.shashanktyagi.roadrash-rickshaw.savedState",
    "~/Library/WebKit/com.shashanktyagi.roadrash-rickshaw",
    "~/Library/WebKit/RoadRash",
  ]
end
