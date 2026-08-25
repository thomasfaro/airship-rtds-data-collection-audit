-- Source of the "Start RTDS Audit" bundle that owns the rtds-audit:// scheme, so a
-- page in the browser can start the tool. scripts/install-url-handler.sh fills in the
-- app folder below and compiles this with osacompile.
--
-- Opened from the Dock or Spotlight it also opens the browser; reached through the
-- URL scheme it does not, because the page that called it reloads itself.

on run
	start_tool("--open")
end run

on open location this_URL
	start_tool("")
end open location

on start_tool(flags)
	set toolRoot to "__ROOT__"
	set launcher to quoted form of (toolRoot & "/scripts/start-detached.sh")
	do shell script "/usr/bin/nohup /bin/bash " & launcher & " " & flags & " >/dev/null 2>&1 &"
end start_tool
