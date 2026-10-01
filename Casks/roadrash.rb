cask "roadrash" do
  version "3.3.0"
  sha256 "8f094fa4406365dc67d9a70f17c2028dca6159dbfe8af923ea6e4703d392cbf7"

  url "https://github.com/shankyty/Roadrash/releases/download/v#{version}/RoadRash.dmg"
  name "Road Rash: Rickshaw Rumble"
  desc "Road Rash-style combat racer where you drive an auto-rickshaw through Indian cities"
  homepage "https://github.com/shankyty/Roadrash"

  depends_on macos: :ventura

  app "Road Rash.app"

  # The app is ad-hoc signed (not notarized); clear quarantine so it opens without a Gatekeeper prompt.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "{{appdir}}/Road Rash.app"]
  end

  zap trash: [
    "~/Library/Saved Application State/com.shashanktyagi.roadrash-rickshaw.savedState",
    "~/Library/WebKit/com.shashanktyagi.roadrash-rickshaw",
    "~/Library/WebKit/RoadRash",
  ]
end
