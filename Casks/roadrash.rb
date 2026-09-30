cask "roadrash" do
  version "2.6.0"
  sha256 "b6f58ae96baa4bb48b3850503aceaaa6e2f6dc4e9c36087a2b1e0d9cfe51d681"

  url "https://github.com/shankyty/Roadrash/releases/download/v#{version}/RoadRash.dmg"
  name "Road Rash: Rickshaw Rumble"
  desc "Road Rash-style combat racer where you drive an auto-rickshaw through Indian cities"
  homepage "https://github.com/shankyty/Roadrash"

  depends_on macos: ">= :ventura"

  app "Road Rash.app"

  # The app is ad-hoc signed (not notarized); clear quarantine so it opens without a Gatekeeper prompt.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Road Rash.app"]
  end

  zap trash: [
    "~/Library/Saved Application State/com.shashanktyagi.roadrash-rickshaw.savedState",
    "~/Library/WebKit/com.shashanktyagi.roadrash-rickshaw",
    "~/Library/WebKit/RoadRash",
  ]
end
